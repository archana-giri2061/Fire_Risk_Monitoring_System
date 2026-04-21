Here's the updated README without any asterisks:

```markdown
# वन दृष्टि — Fire Risk Monitoring System

An AI-powered wildfire risk prediction system that collects real-time weather data, trains machine learning models, and predicts wildfire risk levels for the Lumbini region of Nepal.

---

## Project Description

Wildfires are increasing due to climate change, rising temperatures, and drought conditions. This system provides real-time weather data collection, historical storage, ML-based risk prediction, automated email alerts, a live React dashboard, and ESP32 IoT sensor monitoring for on-ground fire detection.

---

## Project Workflow

```
Weather API → PostgreSQL → ML Model → Risk Prediction → Dashboard + Email Alerts + IoT Monitor
```

---

## Tech Stack

Backend — Node.js, Express, TypeScript, Zod, Nodemailer, PM2

Database — PostgreSQL with pg (node-postgres)

Machine Learning — Python 3, XGBoost, scikit-learn, Pandas, joblib

Frontend — React 18, TypeScript, Vite, Recharts, React Router, Lucide React

IoT — ESP32 microcontroller with DHT22 (temperature and humidity), MQ-135 (CO2 and smoke), YL-83 (rain), and capacitive soil moisture sensor

Infrastructure — Nginx web server, AWS EC2, Open-Meteo API for weather data

---

## Monitored Location

This system monitors the Lumbini region of Nepal at latitude 28.002 and longitude 83.036, timezone Asia/Kathmandu. The location key used internally is `lumbini_28.002_83.036`.

---

## Project Structure

```
Fire_Risk_Monitoring_System/
├── Backend/
│   ├── src/
│   │   ├── routes/         # API route handlers
│   │   ├── ml/             # Python ML scripts and trained models
│   │   └── index.ts        # Server entry point
│   ├── tsconfig.json
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   ├── pages/          # Dashboard, Forecast, Alerts, IoT, ML Analytics
│   │   ├── components/     # Sidebar, AdminLogin
│   │   ├── utils/          # risk.ts, formatDate.ts
│   │   ├── styles/         # theme.css
│   │   ├── api.ts          # All API calls
│   │   ├── App.tsx         # Root router
│   │   └── main.tsx        # Entry point
│   ├── .env                # VITE_API_URL (not committed)
│   └── package.json
│
└── README.md
```

---

## Dashboard Pages

The frontend has six pages. The landing page is at `/`. The main dashboard showing live weather and current risk is at `/home`. The 7-day ML forecast is at `/forecast`. The live IoT sensor monitor is at `/iot`. Alert history and email controls are at `/alerts`. The ML model metrics, confusion matrix, and charts are at `/ml-analytics`.

---

## Local Development Setup

### 1. Clone the repository

```bash
git clone https://github.com/archana-giri2061/Fire_Risk_Monitoring_System
cd Fire_Risk_Monitoring_System
```

### 2. Configure backend environment variables

Create `Backend/.env` and fill in your values:

```
DB_HOST=localhost
DB_PORT=5432
DB_NAME=fire_risk_db
DB_USER=postgres
DB_PASSWORD=your_password
SMTP_HOST=smtp.gmail.com
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
ADMIN_KEY=your_admin_key
```

### 3. Configure frontend environment variables

Create `frontend/.env`:

```
VITE_API_URL=http://localhost:3000
```

### 4. Install and run the backend

```bash
cd Backend
npm install
npm run build
npm start
```

### 5. Install and run the frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend will be available at `http://localhost:5173`.

---

## ML Pipeline

Weather archive data is preprocessed and formatted into model features. An XGBoost multi-class classifier is then trained on this data to predict one of four risk levels — Low, Moderate, High, or Extreme. At prediction time the system fetches the 7-day weather forecast, runs it through the model, and returns a risk label and confidence score for each day. If any day comes back as High or Extreme the system automatically dispatches an alert email to subscribers.

The model is retrained monthly as more local weather data accumulates, which improves accuracy over time. Training metrics including accuracy, confusion matrix, and feature importance are all visible on the ML Analytics page.

---

## Production Deployment (EC2)

### SSH into the server

```powershell
ssh -i "C:\Users\ARCHANA\Downloads\Forest_fire.pem" ubuntu@52.202.127.155
```

### Pull and deploy latest code

```bash
cd ~/Fire_Risk_Monitoring_System
git pull origin main

cd Backend
npm run build
pm2 restart fire-backend
pm2 restart vandrishti-backend

cd ../frontend
npm run build
sudo cp -r dist/* /var/www/html/

pm2 status
```

### View live site

```
http://52.202.127.155
```

---

## Deploy Script

To avoid running the above commands manually every time, save them as a script:

```bash
nano ~/deploy.sh
```

```bash
#!/bin/bash
cd ~/Fire_Risk_Monitoring_System
git pull origin main

cd Backend
npm run build
pm2 restart fire-backend
pm2 restart vandrishti-backend

cd ../frontend
npm run build
sudo cp -r dist/* /var/www/html/

pm2 status
```

```bash
chmod +x ~/deploy.sh
~/deploy.sh
```

---

## Troubleshooting

Backend not starting — run `pm2 logs fire-backend --lines 30` to see the error.

Frontend showing old version after deploy — run `sudo systemctl restart nginx` then press `Ctrl + Shift + R` in the browser to hard refresh.

API calls failing from the frontend — check that `VITE_API_URL` in `frontend/.env` points to the correct backend IP with no trailing slash, then rebuild the frontend.

ML prediction failing — reinstall Python dependencies and check logs:

```bash
pip3 install -r ~/Fire_Risk_Monitoring_System/Backend/ml/scripts/requirements.txt --break-system-packages
pm2 logs fire-backend --lines 50
```

---

## License

This project was built as a Final Year Project for academic purposes.
```