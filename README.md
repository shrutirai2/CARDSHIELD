# CardShield - Credit Card Fraud Detection System

**Final Year B.Tech Project**  
A Full-Stack Machine Learning Web Application to detect fraudulent credit card transactions in real-time.

## 🚀 Live Demo

- **Frontend**: [CardShield Frontend](https://your-frontend.onrender.com)  
- **Backend API**: [CardShield Backend](https://your-backend.onrender.com)

## ✨ Key Features

- Real-time Single Transaction Fraud Analysis
- Batch Processing using CSV file upload
- Interactive Dashboard with model performance
- Beautiful modern UI with glassmorphism design
- Dual Mode (Real ML + Mock Mode)
- Fully Responsive Design

## 🛠 Tech Stack

- **Frontend**: React.js + Tailwind CSS
- **Backend**: Flask (Python)
- **Machine Learning**: XGBoost Classifier
- **Deployment**: Render.com

## 📂 Project Structure

CardShield/
├── backend/
│   ├── app.py
│   ├── train_model.py
│   ├── model.pkl
│   ├── requirements.txt
│   └── data/
│       └── creditcard.csv
│
└── frontend/
    ├── src/
    │   ├── App.js
    │   └── index.css
    ├── package.json
    └── tailwind.config.js

## How to Run Locally

### Backend
```bash
cd backend
python -m venv venv
venv\Scripts\activate     # Windows
pip install -r requirements.txt
python train_model.py
python app.py

Frontendbash

cd frontend
npm install
npm start

