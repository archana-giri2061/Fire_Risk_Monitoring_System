# Fire_Risk_Monitoring_System
An AI-powered wildfire risk prediction system that collects real-time weather data, stores it in a database, trains machine learning models, and predicts wildfire risk levels for Nepal.

# Project Descriprion
Wildfires are increasing due to climate change, rising temperatures, and drought conditions. This project aims to build a real-time wildfire risk prediction system that:

-Collects live weather data from an API

-Stores historical weather data in a database

-Trains machine learning models using wildfire datasets

-Predicts wildfire risk levels (Low, Medium, High)

-Provides predictions through a backend API

The system supports continuous learning by retraining models using stored historical data.

# Project workflow
Weather API → MySQL Database → ML Model → Risk Prediction → Dashboard + Alerts

# Tech Stack
Backend
- Node.js & Express
- TypeScript 
Database
- Postgresql
Machine Learning
- Python (scikit-learn)
- Pandas
- joblib

Optional Frontend
- React (Dashboard)

- REST APIs
- Pg (node-postgres)
- Zod (validation)
- Open-Meteo API


# 2. Install all necessary packages 
# 3. Add weather free Api and make postgresql database
- Collects real-time weather data
- Stores weather data in PostgresSQl

-It collects, stores and manages historical and forecast weather data using:
  open-Meteo API (Archive + Forecast)
  Node.js(Express framework)
  TypeScript
  PostgreSQL

Location Used: 
-Latitude:  28.002
-Longitude: 83.036
-Timezone:  Asia/Kathmandu
-Location Key: lumbini_28.002_83.036

# 4. Training using past forest fire and weather data and testing using historical last 2 months data and testing using forecast 7 days data 
1. Data Preprocessing
2. Model Training
3. Real-Time Prediction Process
- Fetch live weather data
- Store in database
- Convert data into model feature format 
- Load trained model
- predict wildfire risk
- Return JSON response

# 5. SMS alert and Notification System


# Model Retraining Strategy ( IN Future)
Retrained Monthly
Uses Newly stored weather data
Improves accuracy over time


