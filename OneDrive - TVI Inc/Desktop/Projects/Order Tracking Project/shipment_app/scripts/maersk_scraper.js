/**
 * Maersk Booking Scraper
 * Usage: node scripts/maersk_scraper.js <booking_number>
 *
 * Strategy:
 *  1. Accept cookie consent banner
 *  2. Intercept Maersk's internal tracking API response (JSON)
 *  3. Fall back to DOM extraction if interception misses
 */

const puppeteer = require('puppeteer');

const bookingNumber = (process.argv[2] || '').trim();

if (!bookingNumber) {
    process.stdout.write(JSON.stringify({ success: false, error: 'No booking number provided.' }));
    process.exit(0);
}

function out(data) {
    process.stdout.write(JSON.stringify(data));
}

function parseDate(val) {
    if (!val) return null;
    const d = new Date(val);
    return isNaN(d) ? null : d.toISOString().slice(0, 10);
}

function normalizeApiResponse(json) {
    const shipment = (json.shipments || [])[0] || json;
    const plan     = (shipment.transportPlans || [])[0] || {};
    const legs     = plan.transportLegs || shipment.legs || [];
    const leg      = legs[0] || {};

    const vessel = leg?.vessel?.vesselName
        || leg?.transport?.vessel?.name
        || shipment.vesselName || null;

    const voyage = leg?.transport?.voyageReference
        || leg?.voyage?.number
        || shipment.voyageNumber || null;

    const cutOff = shipment.cargoClosingDate || plan.cargoClosingDate || shipment.cutOff || null;
    const eta    = leg.plannedArrivalDate   || leg.arrivalDate   || plan.plannedArrivalDate   || shipment.eta || null;
    const etd    = leg.plannedDepartureDate || leg.departureDate || plan.plannedDepartureDate || shipment.etd || null;
    const pol    = leg?.departureLocation?.cityName || leg?.portOfLoading?.name  || null;
    const pod    = leg?.arrivalLocation?.cityName   || leg?.portOfDischarge?.name || null;

    const parts = [
        vessel ? 'Vessel: ' + vessel : null,
        voyage ? 'Voyage: ' + voyage : null,
        pol    ? 'POL: '    + pol    : null,
        pod    ? 'POD: '    + pod    : null,
        eta    ? 'ETA: '    + eta    : null,
    ].filter(Boolean);

    return {
        success: true, vessel, voyage,
        cut_off: parseDate(cutOff), eta: parseDate(eta), etd: parseDate(etd),
        pol, pod, description: parts.join(' | ') || null, error: null,
    };
}

async function dismissCookieBanner(page) {
    // Try common accept-all selectors used by consent tools
    const acceptSelectors = [
        // CookieInformation (used by Maersk)
        '#coiConsentBannerAcceptBtn',
        'button[id*="accept-all"]',
        'button[class*="accept-all"]',
        // Generic
        'button[data-testid*="accept"]',
        'button[aria-label*="Accept"]',
        '[data-cid="CookieBannerSaveButton"]',
        '#CookieConsentAcceptAll',
        '#onetrust-accept-btn-handler',
        '.cookie-accept',
    ];

    for (const sel of acceptSelectors) {
        try {
            const btn = await page.$(sel);
            if (btn) {
                await btn.click();
                await new Promise(r => setTimeout(r, 1200));
                return true;
            }
        } catch (_) {}
    }

    // Try clicking any visible button containing "Accept" text
    try {
        await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button'));
            const acceptBtn = buttons.find(b =>
                /accept\s*(all|cookies)?/i.test(b.textContent) && b.offsetParent !== null
            );
            if (acceptBtn) acceptBtn.click();
        });
        await new Promise(r => setTimeout(r, 1200));
    } catch (_) {}

    return false;
}

(async () => {
    let browser;

    try {
        browser = await puppeteer.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--disable-blink-features=AutomationControlled',
            ],
        });

        const page = await browser.newPage();

        await page.setUserAgent(
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
            'AppleWebKit/537.36 (KHTML, like Gecko) ' +
            'Chrome/124.0.0.0 Safari/537.36'
        );
        await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });

        // Hide webdriver flag
        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => false });
        });

        // ── Intercept Maersk's internal tracking API responses ────────────────
        let captured = null;

        page.on('response', async (response) => {
            if (captured) return;
            const url    = response.url();
            const status = response.status();
            const ct     = response.headers()['content-type'] || '';

            // Cast wide net — any JSON from Maersk/MLBV domains with tracking-like data
            const isMaerskDomain = url.includes('maersk') || url.includes('mlbv');
            const isJson         = ct.includes('json');

            if (isMaerskDomain && isJson && status === 200) {
                try {
                    const json = await response.json();
                    if (json && (
                        json.shipments       ||
                        json.transportPlans  ||
                        json.vessel          ||
                        json.vesselName      ||
                        json.bookingReference ||
                        json.trackingData    ||
                        (Array.isArray(json) && json[0]?.vesselName)
                    )) {
                        captured = json;
                    }
                } catch (_) {}
            }
        });

        const trackUrl = 'https://www.maersk.com/tracking/' + encodeURIComponent(bookingNumber);
        await page.goto(trackUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });

        // Accept cookie consent then wait for SPA to load tracking data
        await dismissCookieBanner(page);

        // Wait for network to settle after cookie dismiss
        try {
            await page.waitForNetworkIdle({ idleTime: 2000, timeout: 20000 });
        } catch (_) {
            await new Promise(r => setTimeout(r, 4000));
        }

        // Extra buffer for late XHR calls
        await new Promise(r => setTimeout(r, 2000));

        // ── Use intercepted API data ──────────────────────────────────────────
        if (captured) {
            await browser.close();
            out(normalizeApiResponse(captured));
            return;
        }

        // ── Fall back: extract from DOM ───────────────────────────────────────
        const fields = await page.evaluate((bn) => {
            // Helper: get trimmed text of first matching element
            const t = (...sels) => {
                for (const sel of sels) {
                    const el = document.querySelector(sel);
                    if (el && el.textContent.trim()) return el.textContent.trim();
                }
                return null;
            };

            // Look for labelled value pairs (common React pattern)
            // e.g. <dt>Vessel</dt><dd>EVER GOLDEN</dd>
            function findLabelledValue(labelText) {
                const labels = Array.from(document.querySelectorAll('dt,th,label,span,p'))
                    .filter(el => new RegExp(labelText, 'i').test(el.textContent.trim()));
                for (const label of labels) {
                    const sibling = label.nextElementSibling;
                    if (sibling && sibling.textContent.trim()) return sibling.textContent.trim();
                    const parent  = label.parentElement;
                    const valueEl = parent && parent.querySelector('dd,td,strong,b');
                    if (valueEl && valueEl.textContent.trim()) return valueEl.textContent.trim();
                }
                return null;
            }

            const vessel = findLabelledValue('vessel');
            const voyage = findLabelledValue('voyage');
            const eta    = findLabelledValue('eta|estimated.arrival|arrival.date');
            const cutOff = findLabelledValue('cut.off|cargo.closing|closing.date');
            const pol    = findLabelledValue('port.of.loading|origin|departure');
            const pod    = findLabelledValue('port.of.discharge|destination|arrival.port');

            // Capture page title + headings to help debug
            const heading = t('h1,h2,[class*="heading"],[class*="title"]');

            return { vessel, voyage, eta, cutOff, pol, pod, heading };
        }, bookingNumber);

        await browser.close();

        const hasData = fields.vessel || fields.voyage || fields.eta || fields.cutOff;

        if (hasData) {
            const parts = [
                fields.vessel ? 'Vessel: ' + fields.vessel : null,
                fields.voyage ? 'Voyage: ' + fields.voyage : null,
                fields.pol    ? 'POL: '    + fields.pol    : null,
                fields.pod    ? 'POD: '    + fields.pod    : null,
                fields.eta    ? 'ETA: '    + fields.eta    : null,
            ].filter(Boolean);

            out({
                success:     true,
                vessel:      fields.vessel  || null,
                voyage:      fields.voyage  || null,
                cut_off:     parseDate(fields.cutOff),
                eta:         parseDate(fields.eta),
                etd:         null,
                pol:         fields.pol || null,
                pod:         fields.pod || null,
                description: parts.join(' | ') || null,
                error:       null,
            });
        } else {
            out({
                success: false,
                error:   'Booking not found or Maersk page structure has changed. ' +
                         (fields.heading ? 'Page heading: ' + fields.heading : 'No heading found.'),
            });
        }

    } catch (e) {
        if (browser) { try { await browser.close(); } catch (_) {} }
        out({ success: false, error: 'Scraper error: ' + e.message });
    }
})();
