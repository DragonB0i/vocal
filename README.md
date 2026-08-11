## 🚀 What We Built

**Vocal** is a web application developed as part of an assignment for **VocalLabs**.

The project combines a modern frontend with Nhost's backend services and AI functionality through Groq.

### Main technologies used

* **Next.js** – Frontend application
* **TypeScript** – Application logic and type safety
* **Nhost** – Backend-as-a-service
* **Hasura GraphQL** – GraphQL API and database access
* **PostgreSQL** – Database
* **Nhost Auth** – User authentication
* **Nhost Storage** – File storage
* **Nhost Functions** – Backend/serverless functions
* **Groq API** – AI/LLM functionality
* **Tailwind CSS** – UI styling
* **GitHub** – Version control
* **Vercel** – Frontend deployment

---

## 🧩 Project Structure

```text
vocal/
├── src/                 # Next.js application
├── functions/           # Nhost backend functions
├── nhost/
│   ├── nhost.toml      # Nhost project configuration
│   └── ...
├── public/              # Static assets
├── docs/                # Project documentation
├── package.json
└── README.md
```

---

## 🔐 Authentication & Backend

The project uses **Nhost** for its backend services, including:

* Authentication
* PostgreSQL database
* Hasura GraphQL
* Storage
* Backend functions

Environment variables and secrets are used for sensitive configuration such as:

```text
GROQ_API_KEY
HASURA_GRAPHQL_ADMIN_SECRET
NHOST_WEBHOOK_SECRET
HASURA_GRAPHQL_JWT_SECRET
```

Sensitive values are kept out of the repository.

---

## 🤖 AI

The project uses the **Groq API** for its AI functionality.

The API key is kept server-side through environment variables rather than being exposed directly in the frontend.

---

# 🛠️ The Deployment Adventure 😭

Development was mostly straightforward. Deployment was a different story.

Nhost initially failed with:

```text
Config.hasura.jwtSecrets.0:
incomplete value
```

We spent quite a while tracing this down to the JWT configuration being stored in the Nhost project configuration.

After pulling the actual configuration using the Nhost CLI, we were able to see the JWT configuration that Nhost was actually using.

We also had to switch to **WSL** because the Nhost CLI doesn't run natively on Windows.

Eventually:

```bash
nhost config validate --subdomain <subdomain>
```

returned:

```text
Getting secrets...
Config is valid!
```

There were also a few Git authentication and merge conflicts along the way because some configuration changes were made through GitHub while others were made locally. 😅

After sorting those out, the latest deployment successfully passed the configuration stage and reached the application startup stage.

---

# 🏃 Running Locally

```bash
npm install
npm run dev
```

Then open:

```text
http://localhost:3000
```

---

# 📌 Current Status

| Component        | Status |
| ---------------- | ------ |
| Next.js frontend | ✅      |
| TypeScript       | ✅      |
| AI integration   | ✅      |
| Nhost Auth       | ✅      |
| Hasura           | ✅      |
| PostgreSQL       | ✅      |
| Nhost Functions  | ✅      |
| Vercel           | ✅      |
| Nhost deployment | 🟡     |

---

### Built for the VocalLabs assignment with ☕, TypeScript, AI, and way too much deployment debugging. 😂
