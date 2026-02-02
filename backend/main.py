from fastapi import FastAPI
import numpy as np
from fastapi.middleware.cors import CORSMiddleware
import joblib
import pandas as pd
from datasets import load_dataset
from fairlearn.metrics import demographic_parity_difference, equalized_odds_difference

# App setup

app = FastAPI()

# Allow frontend to call backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # Next.js default
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


model = joblib.load("ai_judge_model.pkl")



# Root test

@app.get("/")
def root():
    return {"status": "Backend running successfully"}



# AI JUDGE MODE

REQUIRED_COLS = [
    "legal_principles_discussed", "accused_gender", "region", "legal_text",
    "ipc_sections", "facts", "date", "bail_cancellation_case", "summary",
    "legal_issues", "crime_type", "prior_cases", "bail_outcome_label_detailed",
    "court", "judgment_reason", "landmark_case", "special_laws", "bail_type",
    "bias_flag", "parity_argument_used", "judge"
]


@app.post("/predict")
def predict(payload: dict):
    try:
        # 1) Start with NaN everywhere
        row = {col: np.nan for col in REQUIRED_COLS}

        # 2) Overwrite with incoming values
        for k, v in payload.items():
            row[k] = v

        # 3) Replace "" with NaN globally (VERY IMPORTANT)
        for col in REQUIRED_COLS:
            if row.get(col) == "":
                row[col] = np.nan

        # 4) Only these are true free-text (must remain strings)
        TEXT_COLS = ["facts", "legal_issues", "judgment_reason", "summary", "legal_text"]

        # 5) Ensure text cols are strings (never None/NaN)
        for col in TEXT_COLS:
            val = row.get(col, np.nan)
            if val is None or (isinstance(val, float) and np.isnan(val)):
                row[col] = ""
            else:
                row[col] = str(val)

        # 6) Build legal_text (safe even if you only send facts)
        row["legal_text"] = (
            f"{row.get('facts','')} "
            f"{row.get('legal_issues','')} "
            f"{row.get('judgment_reason','')} "
            f"{row.get('summary','')}"
        ).strip()

        # 7) Create dataframe with correct order
        case_df = pd.DataFrame([row])[REQUIRED_COLS]

        # 8) CRITICAL: Coerce ALL non-text columns to numeric (strings -> NaN)
        non_text_cols = [c for c in REQUIRED_COLS if c not in TEXT_COLS]
        for c in non_text_cols:
            case_df[c] = pd.to_numeric(case_df[c], errors="coerce")

        # 9) Predict
        proba = model.predict_proba(case_df)[0]
        pred = int(proba[1] >= 0.5)

        return {
            "decision": "Bail Granted" if pred == 1 else "Bail Rejected",
            "confidence": round(float(max(proba)), 3),
            "prob_granted": round(float(proba[1]), 3),
            "prob_rejected": round(float(proba[0]), 3),
            "received_keys": list(payload.keys()),
        }

    except Exception as e:

        try:
            bad = {}
            for col in REQUIRED_COLS:
                val = row.get(col, None)
                if isinstance(val, str) and col not in TEXT_COLS:
                    bad[col] = val
            return {"error": str(e), "received_keys": list(payload.keys()), "non_numeric_strings": bad}
        except:
            return {"error": str(e), "received_keys": list(payload.keys())}
# AUDIT MODE

@app.get("/audit-report")
def audit_report():
    try:
        from datasets import load_dataset
        from fairlearn.metrics import demographic_parity_difference, equalized_odds_difference
        import pandas as pd

        
        # 1. Load dataset
       
        ds = load_dataset("SnehaDeshmukh/IndianBailJudgments-1200")
        df = ds["train"].to_pandas()

        
        # 2. Recreate legal_text like training
       
        df["legal_text"] = (
            df["facts"].fillna("").astype(str) + " " +
            df["legal_issues"].fillna("").astype(str) + " " +
            df["judgment_reason"].fillna("").astype(str) + " " +
            df["summary"].fillna("").astype(str)
        )

       
        # 3. y_true mapping
        
        y_true = df["bail_outcome"].astype(str).str.lower().map({
            "granted": 1,
            "rejected": 0
        })

        valid_mask = y_true.notna()
        df = df.loc[valid_mask].reset_index(drop=True)
        y_true = y_true.loc[valid_mask].astype(int)

        
        # 4. Prepare X exactly like model expects
        
        X = df.copy()

        for col in REQUIRED_COLS:
            if col not in X.columns:
                X[col] = None

        X = X[REQUIRED_COLS]

       
        # 5. Predict using model
       
        y_pred = model.predict(X)

        
        # 6. Build filtered_df
        
        filtered_df = pd.DataFrame({
            "y_true": y_true,
            "y_pred": y_pred,
            "region": df["region"].fillna("unknown")
        })

        
        # 7. Clean region column
        
        filtered_df = filtered_df[filtered_df["region"].notna()]
        filtered_df = filtered_df[filtered_df["region"] != ""]
        filtered_df["region"] = filtered_df["region"].astype(str)

        
        # 8. Group small regions
        
        region_counts = filtered_df["region"].value_counts()
        small_regions = region_counts[region_counts < 30].index
        filtered_df["region"] = filtered_df["region"].replace(small_regions, "Other")

        
        # 9. Fairness Metrics
        
        dp = demographic_parity_difference(
            filtered_df["y_true"],
            filtered_df["y_pred"],
            sensitive_features=filtered_df["region"]
        )

        eo = equalized_odds_difference(
            filtered_df["y_true"],
            filtered_df["y_pred"],
            sensitive_features=filtered_df["region"]
        )

        bias_score = (abs(float(dp)) + abs(float(eo))) / 2

        if bias_score < 0.1:
            level = "Low"
        elif bias_score < 0.3:
            level = "Moderate"
        else:
            level = "High"

       
        # 10. Return results
        
        return {
            "DP": round(float(dp), 3),
            "EO": round(float(eo), 3),
            "Bias Score": round(float(bias_score), 3),
            "Bias Level": level,
            "cases_used": len(filtered_df)
        }

    except Exception as e:
        return {"error": str(e)}