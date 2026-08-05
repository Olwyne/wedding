// emailjs-config.js
// EmailJS config. Public key + IDs are safe to expose client-side (EmailJS
// design). Create a free account at https://www.emailjs.com, then fill in:
// 1. Email Services > Add service (e.g. Gmail) -> serviceId
// 2. Email Templates > create ONE template (reused for admin notif + guest
//    confirmation, only recipient changes) -> templateId
//    Set "To email" field to {{to_email}}.
//    Variables to use in the template: {{guest_name}} {{status}} {{email}}
//    {{phone}} {{adults}} {{children}} {{diet}} {{message}} {{events}}
// 3. Account > General > Public Key -> publicKey
export const emailjsConfig = {
  publicKey: 'L_k9hW63Ibv61iRSr',
  serviceId: 'service_f6ctr5w',
  templateId: 'template_7uzqevc',
  adminEmail: 'sophbyr@gmail.com',
};
