const RECIPIENT = 'info@zuern-gartenanlagen.de';

type TextControl = HTMLInputElement | HTMLTextAreaElement;

function setTextValidity(control: TextControl, missingMessage: string): void {
  control.setCustomValidity('');
  if (control.validity.valueMissing) control.setCustomValidity(missingMessage);
  else if (control.validity.typeMismatch) control.setCustomValidity('Bitte geben Sie eine gültige E-Mail-Adresse ein.');
}

function buildMailto(form: HTMLFormElement): string {
  const data = new FormData(form);
  const value = (key: string) => String(data.get(key) ?? '').trim();
  const body = [
    `Name: ${value('name')}`,
    `Telefon: ${value('tel') || 'nicht angegeben'}`,
    `E-Mail: ${value('email')}`,
    `Anliegen: ${value('anliegen') || 'nicht angegeben'}`,
    '',
    value('nachricht'),
  ].join('\n');
  const subject = `Anfrage Garten: ${value('name')}`;
  return `mailto:${RECIPIENT}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function initContactForm(): void {
  const form = document.querySelector<HTMLFormElement>('#anfrage');
  const status = document.getElementById('form-status');
  const name = document.querySelector<HTMLInputElement>('#name');
  const email = document.querySelector<HTMLInputElement>('#email');
  const message = document.querySelector<HTMLTextAreaElement>('#nachricht');
  const consent = document.querySelector<HTMLInputElement>('#dsgvo');
  if (!form || !status || !name || !email || !message || !consent) return;

  const validate = () => {
    setTextValidity(name, 'Bitte geben Sie Ihren Namen ein.');
    setTextValidity(email, 'Bitte geben Sie Ihre E-Mail-Adresse ein.');
    setTextValidity(message, 'Bitte schreiben Sie eine kurze Nachricht.');
    consent.setCustomValidity(consent.checked ? '' : 'Bitte stimmen Sie der Verarbeitung zur Beantwortung Ihrer Anfrage zu.');
  };

  for (const control of [name, email, message, consent]) {
    control.addEventListener('input', validate);
    control.addEventListener('change', validate);
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    validate();
    if (!form.checkValidity()) {
      form.reportValidity();
      status.textContent = 'Bitte prüfen Sie die markierten Felder.';
      return;
    }
    status.textContent = `Ihr E-Mail-Programm öffnet sich mit der Anfrage an ${RECIPIENT}.`;
    window.location.href = buildMailto(form);
  });
}
