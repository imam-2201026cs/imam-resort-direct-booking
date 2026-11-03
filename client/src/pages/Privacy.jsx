import { useTitle } from '../lib/hooks.js';

export default function Privacy() {
  useTitle('Privacy notice');
  const h = 'mt-8 text-2xl';
  return (
    <div className="mx-auto max-w-2xl px-4 py-12 leading-relaxed">
      <h1 className="text-4xl">Privacy notice</h1>
      <p className="mt-2 text-muted">How Company A Resort handles your personal data under the Digital Personal Data Protection Act, 2023. This is a demonstration notice for a prototype.</p>
      <h2 className={h}>What we collect and why</h2>
      <p className="mt-2">For a booking: your name, email, mobile number and any request you add, so we can confirm and run your stay. For an enquiry: your name, a way to reach you, and what you tell us, so the right person can reply. We do not collect passport details online. Foreign guests complete Form C at check-in.</p>
      <h2 className={h}>Payments</h2>
      <p className="mt-2">This prototype runs in test mode and never receives card numbers.</p>
      <h2 className={h}>How we use enquiries</h2>
      <p className="mt-2">Messages may be read by software that sorts them by topic and prepares a draft reply. A member of our team reviews every reply before it is sent. We do not use your details for marketing unless you separately opt in.</p>
      <h2 className={h}>How long we keep it</h2>
      <p className="mt-2">Only as long as needed for your booking or enquiry, and as the law requires.</p>
      <h2 className={h}>Your rights</h2>
      <p className="mt-2">You can ask to see, correct or erase your data, withdraw consent, or raise a grievance. Write to privacy@resort.example with your booking or enquiry reference.</p>
    </div>
  );
}
