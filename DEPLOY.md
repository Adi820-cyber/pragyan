# 🚀 1-Click Deployment Guide for Render

This repository is pre-configured with a **Render Blueprint (`render.yaml`)**.

---

## ⚡ Method 1: Automatic Blueprint (Easiest — 1 Click)

1. Push your code to your GitHub repository (`https://github.com/Adi820-cyber/pragyan`).
2. Log in to [Render.com](https://dashboard.render.com/).
3. Click the **"New +"** button at the top right, and select **"Blueprint"**.
4. Connect and select your repository: **`Adi820-cyber/pragyan`**.
5. Render will automatically detect `render.yaml` and configure both services:
   - **`reskure-api`** (Django REST API backend with SQLite / PostgreSQL)
   - **`reskure-web`** (Next.js web application frontend)
6. Click **"Apply"**!

Render will build, run database migrations, seed demo accounts, and launch both services live!

---

## 🛠️ Method 2: Manual Web Service Setup (If not using Blueprints)

If you prefer deploying services individually:

### Step 1: Deploy Backend (`reskure-api`)
* **Type**: Web Service
* **Runtime**: Python
* **Root Directory**: `backend`
* **Build Command**: `chmod +x build.sh && ./build.sh`
* **Start Command**: `gunicorn reskure.wsgi:application --bind 0.0.0.0:$PORT`
* **Environment Variables**:
  - `DEBUG`: `True`
  - `SECRET_KEY`: *(Any random string)*
  - `ALLOWED_HOSTS`: `*`
  - `ALLOW_DEMO_SEED`: `True`

### Step 2: Deploy Frontend (`reskure-web`)
* **Type**: Web Service
* **Runtime**: Node
* **Root Directory**: `frontend`
* **Build Command**: `npm install && npm run build`
* **Start Command**: `npm run start`
* **Environment Variables**:
  - `NODE_ENV`: `production`
  - `API_BASE_URL`: `https://<YOUR-BACKEND-NAME>.onrender.com/api/v1`

---

## 🔑 Default Seeded Login Credentials

Once deployed, you can immediately log in:

| Role | Username | Password |
| :--- | :--- | :--- |
| **Tenant Admin** | `admin` | `Password123!` |
| **Risk Owner** | `founder@hirelens.example` | `Password123!` |
| **Compliance Officer** | `advisor@hirelens.example` | `Password123!` |
