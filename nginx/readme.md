# 🚀 Nginx Configuration Guide for Fullstack App

This guide explains how to set up and apply an **Nginx configuration** for serving a frontend (React, Vue, etc.) and proxying requests to a backend (Node.js, Express, Socket.io, etc.).

---

## 📂 Nginx Config Structure
- **Main config file:** `/etc/nginx/nginx.conf`
- **Site configs (recommended):**
  - `/etc/nginx/sites-available/` → store config files here
  - `/etc/nginx/sites-enabled/` → symlinks to active configs

---

## 📝 Example Configuration

Create a file named `/etc/nginx/sites-available/app.conf`:

```nginx
server {
    listen 80;
    server_name example.com;

    # Frontend build (React/Vue/Angular)
    root /var/www/app;
    index index.html index.htm;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # Backend API
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # WebSocket (Socket.io)
    location /socket.io/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
```

---

## 1. Create/Edit the site config
sudo vim /etc/nginx/sites-available/app.conf

# 2. Enable the site by creating a symlink
sudo ln -s /etc/nginx/sites-available/app.conf /etc/nginx/sites-enabled/

# 3. Test configuration for syntax errors
sudo nginx -t

# 4. Reload Nginx to apply changes (no downtime)
sudo systemctl reload nginx

# (Optional) Restart Nginx completely
sudo systemctl restart nginx
