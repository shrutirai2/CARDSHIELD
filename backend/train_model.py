# train_model.py
# Loads creditcard.csv, trains XGBoost on RAW features (no scaling),
# saves model.pkl using joblib.
# Note: V1-V28 are already PCA-transformed by the dataset authors.
#       Time and Amount are kept raw — XGBoost is tree-based and
#       does not require feature scaling.

import pandas as pd
import joblib
from xgboost import XGBClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, roc_auc_score

# ── 1. Load Data ──────────────────────────────────────────────
df = pd.read_csv("data/creditcard.csv")
print(f"Dataset shape   : {df.shape}")
print(f"Fraud cases     : {df['Class'].sum()} / {len(df)} ({df['Class'].mean()*100:.3f}%)")

# ── 2. Split Features and Label ───────────────────────────────
# Column order: Time, V1-V28, Amount, Class
# We keep Time and Amount completely raw — no StandardScaler.
X = df.drop("Class", axis=1)   # 30 features in original column order
y = df["Class"]

print(f"\nFeature columns : {list(X.columns)}")

# ── 3. Train-Test Split (80 / 20, stratified) ─────────────────
X_train, X_test, y_train, y_test = train_test_split(
    X, y,
    test_size=0.2,
    random_state=42,
    stratify=y          # preserve fraud ratio in both splits
)
print(f"\nTrain size : {X_train.shape[0]}")
print(f"Test  size : {X_test.shape[0]}")

# ── 4. Class Imbalance: scale_pos_weight ─────────────────────
# Formula: count(negative class) / count(positive class)
# Tells XGBoost to penalise missed fraud cases more heavily.
neg = (y_train == 0).sum()
pos = (y_train == 1).sum()
scale_pos_weight = neg / pos
print(f"\nscale_pos_weight : {scale_pos_weight:.2f}  (neg={neg}, pos={pos})")

# ── 5. Train XGBoost ──────────────────────────────────────────
model = XGBClassifier(
    n_estimators=100,
    max_depth=6,
    learning_rate=0.1,
    scale_pos_weight=scale_pos_weight,
    eval_metric="auc",
    random_state=42,
    n_jobs=-1,
)

model.fit(X_train, y_train)
print("\nTraining complete.")

# ── 6. Evaluate on Test Set ───────────────────────────────────
y_pred      = model.predict(X_test)
y_pred_prob = model.predict_proba(X_test)[:, 1]

auc = roc_auc_score(y_test, y_pred_prob)
print(f"\nAUC-ROC Score : {auc:.4f}")
print("\nClassification Report:")
print(classification_report(y_test, y_pred, target_names=["Legit", "Fraud"]))

# ── 7. Save Model ─────────────────────────────────────────────
# The saved model encodes the exact feature order used in training.
# app.py must send features in the same order.
joblib.dump(model, "model.pkl")
print("Model saved → model.pkl")