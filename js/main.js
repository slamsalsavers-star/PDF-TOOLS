document.addEventListener('DOMContentLoaded', function () {
  const feedbackForm = document.getElementById('feedbackForm');
  const feedbackStatus = document.getElementById('feedbackStatus');

  if (!feedbackForm) return;

  feedbackForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    feedbackStatus.textContent = 'Sending your suggestion...';
    feedbackStatus.className = 'status-message';

    const formData = new FormData(feedbackForm);

    try {
      const response = await fetch('https://formsubmit.co/ajax/slamsalsavers@gmail.com', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
        },
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Failed to send feedback.');
      }

      let result = null;
      try {
        result = await response.json();
      } catch {
        // If the service returns no JSON, treat an OK response as success
      }

      if (!result || result.success === 'true' || response.status === 200) {
        feedbackStatus.textContent = 'Thank you! Your suggestion was sent successfully.';
        feedbackStatus.className = 'status-message success';
        feedbackForm.reset();
      } else {
        throw new Error('Submission service returned an error.');
      }
    } catch (error) {
      feedbackStatus.textContent = 'Unable to send your suggestion right now. Please email slamsalsavers@gmail.com directly.';
      feedbackStatus.className = 'status-message error';
      console.error('Feedback submission error:', error);
    }
  });
});
