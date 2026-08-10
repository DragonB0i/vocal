import { createNhostClient } from '@nhost/nhost-js';

const SUBDOMAIN = 'luttcgrgbhoixswtzfxv';
const REGION = 'ap-south-1';

const nhost = createNhostClient({
  subdomain: SUBDOMAIN,
  region: REGION
});

async function checkAuth() {
  const email = 'vocal.owner.a@example.com';
  const password = 'VocalTestPassword123!';

  // First try to sign in in case they exist
  let { session, error } = await nhost.auth.signInEmailPassword({ email, password });
  
  if (error) {
    console.log("Sign-in failed:", error.message);
    // If invalid email/password, try to sign up
    if (error.message.includes('Invalid') || error.message.includes('Incorrect')) {
      console.log("Attempting sign up...");
      const res = await nhost.auth.signUpEmailPassword({ email, password });
      console.log("Sign-up result:", res.error ? res.error.message : (res.session ? "Success, session returned" : "Success, but verification required"));
    }
  } else {
    console.log("Successfully signed in.");
  }
}

checkAuth().catch(console.error);
