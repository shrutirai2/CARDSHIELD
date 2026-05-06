# app.py
# Flask API for Credit Card Fraud Detection.
# IMPORTANT: features are passed to the model RAW — no scaling.
#            Feature order must exactly match training column order.

import io
import joblib
import pandas as pd
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# ── Load Model ────────────────────────────────────────────────
model = joblib.load("model.pkl")
print("model.pkl loaded successfully.")

# Feature order must match the column order used during training.
# creditcard.csv column order: Time, V1-V28, Amount
# (Class is the label and is excluded)
FEATURE_COLS = ["Time"] + [f"V{i}" for i in range(1, 29)] + ["Amount"]


def build_dataframe(data: dict) -> pd.DataFrame:
    """
    Build a single-row DataFrame from a JSON dict.
    No scaling applied — raw values go straight to the model.
    """
    return pd.DataFrame([data])[FEATURE_COLS]


# ── Endpoint 1: Single Prediction ─────────────────────────────
@app.route("/predict_single", methods=["POST"])
def predict_single():
    """
    Input  (JSON): { "Time": 0, "Amount": 149.62, "V1": ..., "V28": ... }
    Output (JSON): { "prediction": 0|1, "label": "Legit"|"Fraud",
                     "fraud_probability": float }
    """
    data = request.get_json()

    # Validate all required fields are present
    missing = [col for col in FEATURE_COLS if col not in data]
    if missing:
        return jsonify({"error": f"Missing fields: {missing}"}), 400

    try:
        df = build_dataframe(data)

        prediction    = int(model.predict(df)[0])
        fraud_prob    = float(model.predict_proba(df)[0][1])

        return jsonify({
            "prediction":        prediction,
            "label":             "Fraud" if prediction == 1 else "Legit",
            "fraud_probability": round(fraud_prob, 4),
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ── Endpoint 2: Batch Prediction (CSV Upload) ──────────────────
@app.route("/predict_batch", methods=["POST"])
def predict_batch():
    """
    Input  (multipart): CSV file with columns Time, V1-V28, Amount.
                        A 'Class' column is ignored if present.
    Output (JSON):      summary counts + per-row predictions.
    """
    if "file" not in request.files:
        return jsonify({"error": "No file uploaded. Use key 'file'."}), 400

    file = request.files["file"]

    if not file.filename.endswith(".csv"):
        return jsonify({"error": "Only CSV files are supported."}), 400

    try:
        df = pd.read_csv(io.StringIO(file.stream.read().decode("utf-8")))

        # Drop ground-truth label if present — not needed for inference
        df.drop(columns=["Class"], errors="ignore", inplace=True)

        # Validate all feature columns exist
        missing = [col for col in FEATURE_COLS if col not in df.columns]
        if missing:
            return jsonify({"error": f"Missing columns in CSV: {missing}"}), 400

        # Select and order columns to match training — no scaling
        df = df[FEATURE_COLS]

        predictions = model.predict(df).tolist()
        fraud_probs = model.predict_proba(df)[:, 1].tolist()

        results = [
            {
                "row":               i + 1,
                "prediction":        predictions[i],
                "label":             "Fraud" if predictions[i] == 1 else "Legit",
                "fraud_probability": round(fraud_probs[i], 4),
            }
            for i in range(len(predictions))
        ]

        summary = {
            "total_transactions": len(results),
            "fraud_detected":     int(sum(predictions)),
            "legit_detected":     int(len(predictions) - sum(predictions)),
        }

        return jsonify({"summary": summary, "results": results})

    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ── Run ───────────────────────────────────────────────────────
if __name__ == "__main__":
    app.run(debug=False, host="0.0.0.0", port=5000)