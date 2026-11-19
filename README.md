# Cresvyn Tech website

The website plus a small Node.js backend that runs the contact form.

```
cresvyn-tech-website/
├── public/            ← the website (HTML, CSS, JS, images)
├── server.js          ← backend: serves the site and handles the contact form
├── package.json
├── .env.example       ← settings template (copy to .env)
└── Dockerfile         ← optional, for Docker/VPS hosting
```

## What the backend does

- **Contact form** (`POST /api/contact`): checks the input, blocks spam bots (hidden honeypot field) and limits each visitor to 5 messages per 15 minutes.
- **Saves every enquiry** to `data/messages.jsonl`, so nothing is lost even if email fails.
- **Emails each enquiry** to `cresvyn.tech@gmail.com`. "Reply" in Gmail goes straight to the sender.
- **Admin inbox** at `https://yourdomain.com/admin`, protected by a password, with a "Download CSV" button.
- Security headers, image caching, a 404 page and a `/healthz` health check.

## Run it on your computer

You need [Node.js](https://nodejs.org) 18 or newer.

```bash
npm install
cp .env.example .env      # then edit .env
npm start
```

Open http://localhost:3000.

## Set up email (Gmail, about 2 minutes)

1. Sign in to `cresvyn.tech@gmail.com` and turn on **2-Step Verification**.
2. Go to https://myaccount.google.com/apppasswords and create an app password named "Website".
3. Paste the 16-character password into `SMTP_PASS` in `.env` (or into your host's environment variables).

Without email set up, the form still works. Messages are saved and appear at `/admin`.

---

## Deploy: buy the domain, then pick ONE option

### Option A: Render (easiest, free tier available)

1. Push this folder to a GitHub repository.
2. On https://render.com choose **New → Web Service** and select the repo.
   - Build command: `npm install`
   - Start command: `npm start`
3. Under **Environment**, add `ADMIN_PASSWORD`, `SMTP_USER`, `SMTP_PASS`, `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`.
4. To keep saved messages across restarts, add a **Disk** (paid plans) mounted at `/var/data` and set `DATA_DIR=/var/data`. On the free plan, rely on email. Saved messages reset when the service restarts.
5. **Settings → Custom Domains**: add `cresvyn.com` and `www.cresvyn.com` (use your real domain). Render shows the DNS records to add.
6. At your domain registrar (GoDaddy, Hostinger, Namecheap…), add those DNS records. HTTPS is set up automatically.

Railway (https://railway.app) works the same way: deploy from GitHub, add the variables, add a volume at `/var/data`, then add the custom domain.

### Option B: Your own VPS (Hostinger VPS, DigitalOcean, AWS Lightsail…)

```bash
# on the server (Ubuntu)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs nginx
git clone <your-repo> /var/www/cresvyn && cd /var/www/cresvyn
npm ci --omit=dev && cp .env.example .env && nano .env
sudo npm i -g pm2 && pm2 start server.js --name cresvyn && pm2 save && pm2 startup
```

Nginx (`/etc/nginx/sites-available/cresvyn`):

```nginx
server {
  server_name cresvyn.com www.cresvyn.com;
  location / { proxy_pass http://127.0.0.1:3000; proxy_set_header Host $host;
               proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
               proxy_set_header X-Forwarded-Proto $scheme; }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/cresvyn /etc/nginx/sites-enabled/ && sudo nginx -t && sudo systemctl reload nginx
sudo apt install -y certbot python3-certbot-nginx && sudo certbot --nginx -d cresvyn.com -d www.cresvyn.com
```

At your registrar, point an **A record** for `@` and `www` to the server's IP address.

### Option C: Docker

```bash
docker build -t cresvyn .
docker run -d --restart unless-stopped -p 3000:3000 --env-file .env -v cresvyn-data:/app/data cresvyn
```

---

## Editing content

- Text and sections: `public/index.html`
- Colours and fonts: the variables at the top of `public/styles.css`
- Images: `public/assets/` (WebP keeps them small)
- Contact-form topics: the `<select>` in `index.html` **and** the `TOPICS` list in `server.js`
