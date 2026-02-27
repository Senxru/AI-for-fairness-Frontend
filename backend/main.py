from fastapi import Depends, FastAPI, HTTPException, status
import numpy as np
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer
import joblib
import pandas as pd

import os
import sqlite3
from datetime import datetime, timedelta, timezone

from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel, Field

# App setup

app = FastAPI()

# Allow frontend to call backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


model = joblib.load("ai_judge_model retrained.pkl")


# -------------------------
# Auth (JWT + SQLite users)
# -------------------------

DB_PATH = os.path.join(os.path.dirname(__file__), "app.db")
JWT_SECRET = os.environ.get("JWT_SECRET", "dev-secret-change-me")
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.environ.get("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))

pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


def _get_db_conn() -> sqlite3.Connection:
    # Allow usage from FastAPI's worker threads by disabling the same-thread check.
    # Each request still gets its own connection via the dependency below.
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn


def init_db() -> None:
    conn = _get_db_conn()
    try:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                full_name TEXT,
                role TEXT NOT NULL,
                org_id TEXT,
                created_at TEXT NOT NULL
            );
            """
        )
        conn.execute("CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);")
        conn.commit()
    finally:
        conn.close()


@app.on_event("startup")
def _startup() -> None:
    init_db()


def get_db():
    conn = _get_db_conn()
    try:
        yield conn
    finally:
        conn.close()


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return pwd_context.verify(password, password_hash)
    except Exception:
        return False


def create_access_token(*, user_id: int, username: str, role: str) -> str:
    now = datetime.now(timezone.utc)
    exp = now + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {"sub": username, "uid": user_id, "role": role, "iat": int(now.timestamp()), "exp": exp}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def _row_to_public_user(row: sqlite3.Row) -> dict:
    return {
        "id": int(row["id"]),
        "username": row["username"],
        "full_name": row["full_name"],
        "role": row["role"],
        "org_id": row["org_id"],
    }


def get_user_by_username(conn: sqlite3.Connection, username: str) -> sqlite3.Row | None:
    return conn.execute("SELECT * FROM users WHERE username = ?;", (username,)).fetchone()


def get_user_by_id(conn: sqlite3.Connection, user_id: int) -> sqlite3.Row | None:
    return conn.execute("SELECT * FROM users WHERE id = ?;", (user_id,)).fetchone()


def create_user(
    conn: sqlite3.Connection,
    *,
    username: str,
    password: str,
    role: str,
    full_name: str | None,
    org_id: str | None,
) -> sqlite3.Row:
    existing = get_user_by_username(conn, username)
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username already exists")

    conn.execute(
        """
        INSERT INTO users (username, password_hash, full_name, role, org_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?);
        """,
        (
            username,
            hash_password(password),
            full_name,
            role,
            org_id,
            datetime.now(timezone.utc).isoformat(),
        ),
    )
    conn.commit()
    created = get_user_by_username(conn, username)
    if created is None:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to create user")
    return created


def authenticate_user(
    conn: sqlite3.Connection, *, username: str, password: str, role: str
) -> sqlite3.Row:
    row = conn.execute(
        "SELECT * FROM users WHERE username = ? AND role = ?;",
        (username, role),
    ).fetchone()
    if row is None or not verify_password(password, row["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return row


class LoginRequest(BaseModel):
    username: str = Field(min_length=3, max_length=50)
    password: str = Field(min_length=6, max_length=128)


class JudgeSignupRequest(BaseModel):
    full_name: str = Field(min_length=1, max_length=100)
    username: str = Field(min_length=3, max_length=50)
    password: str = Field(min_length=6, max_length=128)
    bench_id: str = Field(min_length=1, max_length=100)


class AuthoritySignupRequest(BaseModel):
    full_name: str = Field(min_length=1, max_length=100)
    username: str = Field(min_length=3, max_length=50)
    password: str = Field(min_length=6, max_length=128)
    authority_id: str = Field(min_length=1, max_length=100)


class UserPublic(BaseModel):
    id: int
    username: str
    full_name: str | None = None
    role: str
    org_id: str | None = None


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserPublic


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    conn: sqlite3.Connection = Depends(get_db),
) -> UserPublic:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        uid = payload.get("uid")
        if uid is None:
            raise ValueError("Missing uid")
        row = get_user_by_id(conn, int(uid))
        if row is None:
            raise ValueError("User not found")
        return UserPublic(**_row_to_public_user(row))
    except (JWTError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )


def require_role(*allowed_roles: str):
    def _guard(user: UserPublic = Depends(get_current_user)) -> UserPublic:
        if user.role not in allowed_roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
        return user

    return _guard


@app.post("/auth/judge/signup", response_model=AuthResponse)
def judge_signup(payload: JudgeSignupRequest, conn: sqlite3.Connection = Depends(get_db)):
    row = create_user(
        conn,
        username=payload.username,
        password=payload.password,
        role="judge",
        full_name=payload.full_name,
        org_id=payload.bench_id,
    )
    token = create_access_token(user_id=int(row["id"]), username=row["username"], role=row["role"])
    return {"access_token": token, "user": _row_to_public_user(row)}


@app.post("/auth/judge/login", response_model=AuthResponse)
def judge_login(payload: LoginRequest, conn: sqlite3.Connection = Depends(get_db)):
    row = authenticate_user(conn, username=payload.username, password=payload.password, role="judge")
    token = create_access_token(user_id=int(row["id"]), username=row["username"], role=row["role"])
    return {"access_token": token, "user": _row_to_public_user(row)}


@app.post("/auth/court-authority/signup", response_model=AuthResponse)
def authority_signup(payload: AuthoritySignupRequest, conn: sqlite3.Connection = Depends(get_db)):
    row = create_user(
        conn,
        username=payload.username,
        password=payload.password,
        role="court_authority",
        full_name=payload.full_name,
        org_id=payload.authority_id,
    )
    token = create_access_token(user_id=int(row["id"]), username=row["username"], role=row["role"])
    return {"access_token": token, "user": _row_to_public_user(row)}


@app.post("/auth/court-authority/login", response_model=AuthResponse)
def authority_login(payload: LoginRequest, conn: sqlite3.Connection = Depends(get_db)):
    row = authenticate_user(conn, username=payload.username, password=payload.password, role="court_authority")
    token = create_access_token(user_id=int(row["id"]), username=row["username"], role=row["role"])
    return {"access_token": token, "user": _row_to_public_user(row)}


@app.get("/auth/me", response_model=UserPublic)
def me(current_user: UserPublic = Depends(get_current_user)):
    return current_user



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
def predict(payload: dict, _current_user: UserPublic = Depends(require_role("court_authority"))):
    try:
        # 1) Start with NaN everywhere
        row = {col: np.nan for col in REQUIRED_COLS}

        # 2) Overwrite with incoming values
        for k, v in payload.items():
            row[k] = v

        # 3) Replace "" with NaN
        for col in REQUIRED_COLS:
            if row.get(col) == "":
                row[col] = np.nan

        TEXT_COLS = ["facts", "legal_issues", "judgment_reason", "summary", "legal_text"]


        for col in TEXT_COLS:
            val = row.get(col, np.nan)
            if val is None or (isinstance(val, float) and np.isnan(val)):
                row[col] = ""
            else:
                row[col] = str(val)

        # 6) Build legal_text 
        row["legal_text"] = (
            f"{row.get('facts','')} "
            f"{row.get('legal_issues','')} "
            f"{row.get('judgment_reason','')} "
            f"{row.get('summary','')}"
        ).strip()

        # 7) Create dataframe with correct order
        case_df = pd.DataFrame([row])[REQUIRED_COLS]


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
def audit_report(_current_user: UserPublic = Depends(require_role("judge", "court_authority"))):
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

        
        # 4. Prepare X 
        
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