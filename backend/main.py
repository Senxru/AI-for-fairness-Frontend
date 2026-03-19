from fastapi import Depends, FastAPI, HTTPException, status
import numpy as np
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer
import joblib
import pandas as pd
import shap

import os
import sqlite3
import json
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

# SHAP explainer (initialized lazily on first prediction)
shap_explainer = None
shap_feature_names = None
shap_use_transform = False
shap_preprocessor = None
shap_estimator = None
model_numeric_cols = None
shap_init_error = None


def init_model_metadata() -> None:
    """Extract metadata from the loaded sklearn pipeline (if present)."""
    global model_numeric_cols
    if model_numeric_cols is not None:
        return
    model_numeric_cols = []
    try:
        if hasattr(model, "steps") and len(getattr(model, "steps", [])) > 0:
            first = model.steps[0][1]
            for name, _trans, cols in getattr(first, "transformers", []):
                if name == "num" and isinstance(cols, list):
                    model_numeric_cols = list(cols)
                    break
    except Exception:
        model_numeric_cols = []


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


def get_shap_explainer(background_df: pd.DataFrame):
    """
    Lazily create and cache a SHAP explainer for the current model.

    We use the first request's case_df as background data to avoid
    loading heavy training datasets in the API process.
    """
    global shap_explainer, shap_feature_names, shap_use_transform, shap_preprocessor, shap_estimator, model_numeric_cols, shap_init_error
    if shap_explainer is not None:
        return shap_explainer

    # If the model is a sklearn Pipeline/ColumnTransformer stack, explain on transformed numeric features.
    try:
        is_pipeline_like = hasattr(model, "steps") and hasattr(model, "__getitem__")
        if is_pipeline_like:
            pre = model[:-1]
            est = model[-1]

            # Cache numeric column names from the ColumnTransformer if available
            if model_numeric_cols is None:
                try:
                    ct = model.steps[0][1]
                    for name, _trans, cols in getattr(ct, "transformers", []):
                        if name == "num" and isinstance(cols, list):
                            model_numeric_cols = list(cols)
                            break
                except Exception:
                    model_numeric_cols = []

            X_bg = pre.transform(background_df)
            # Convert sparse to dense for SHAP masker if needed
            if hasattr(X_bg, "toarray"):
                X_bg = X_bg.toarray()
            X_bg = np.asarray(X_bg, dtype=np.float32)
            try:
                shap_feature_names = list(pre.get_feature_names_out())
            except Exception:
                shap_feature_names = None

            # Best explainer for XGBoost: TreeExplainer on the underlying tree model.
            try:
                shap_explainer = shap.TreeExplainer(est)
                shap_init_error = None
            except Exception as e:
                shap_explainer = None
                shap_init_error = f"TreeExplainer init failed: {e}"
                return None

            shap_use_transform = True
            shap_preprocessor = pre
            shap_estimator = est
            return shap_explainer
    except Exception:
        pass

    # Fallback: try a generic explainer directly on the model (no Independent masker on raw strings).
    try:
        shap_explainer = shap.Explainer(model, background_df)
        shap_feature_names = list(background_df.columns)
        shap_use_transform = False
        shap_preprocessor = None
        shap_estimator = None
        shap_init_error = None
        return shap_explainer
    except Exception:
        shap_explainer = None
        shap_feature_names = None
        shap_use_transform = False
        shap_preprocessor = None
        shap_estimator = None
        shap_init_error = "Generic SHAP explainer init failed."
        return None


def sanitize_for_shap(df: pd.DataFrame) -> pd.DataFrame:
    """
    SHAP explainers often assume no None values. Keep types stable:
    - numeric columns -> fill NaN/None with 0
    - non-numeric columns -> fill NaN/None with empty string
    """
    out = df.copy()
    num_cols = model_numeric_cols or []

    for col in out.columns:
        s = out[col]
        if col in num_cols:
            out[col] = pd.to_numeric(s, errors="coerce").fillna(0)
            continue

        if pd.api.types.is_numeric_dtype(s):
            out[col] = s.fillna(0)
        else:
            out[col] = s.fillna("").astype(str)
    return out


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

        # Cases submitted by court authority (inputs + AI output)
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS cases (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at TEXT NOT NULL,
                created_by_user_id INTEGER NOT NULL,
                payload_json TEXT NOT NULL,
                accused_gender TEXT,
                region TEXT,
                court TEXT,
                date TEXT,
                FOREIGN KEY(created_by_user_id) REFERENCES users(id)
            );
            """
        )

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS ai_predictions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                case_id INTEGER NOT NULL UNIQUE,
                created_at TEXT NOT NULL,
                decision TEXT NOT NULL,
                confidence REAL NOT NULL,
                prob_granted REAL NOT NULL,
                prob_rejected REAL NOT NULL,
                shap_json TEXT,
                FOREIGN KEY(case_id) REFERENCES cases(id) ON DELETE CASCADE
            );
            """
        )

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS judge_decisions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                case_id INTEGER NOT NULL,
                judge_user_id INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                decision TEXT NOT NULL,
                notes TEXT,
                UNIQUE(case_id, judge_user_id),
                FOREIGN KEY(case_id) REFERENCES cases(id) ON DELETE CASCADE,
                FOREIGN KEY(judge_user_id) REFERENCES users(id)
            );
            """
        )

        conn.execute("CREATE INDEX IF NOT EXISTS idx_cases_created_by ON cases(created_by_user_id);")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_judge_decisions_judge ON judge_decisions(judge_user_id);")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_judge_decisions_case ON judge_decisions(case_id);")

        conn.commit()
    finally:
        conn.close()


@app.on_event("startup")
def _startup() -> None:
    init_db()
    init_model_metadata()


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


class JudgeDecisionRequest(BaseModel):
    case_id: int
    decision: str = Field(pattern="^(Bail Granted|Bail Rejected)$")
    notes: str | None = Field(default=None, max_length=2000)


class JudgeDecisionResponse(BaseModel):
    case_id: int
    judge_user_id: int
    decision: str
    notes: str | None = None
    created_at: str


class JudgeMetricsResponse(BaseModel):
    judge_user_id: int
    total_cases_with_ai: int
    decided_cases: int
    agreement_rate: float | None = None
    disagreement_rate: float | None = None
    by_gender: dict
    by_region: dict
    judge_grant_rate_by_gender: dict
    judge_grant_rate_by_region: dict
    judge_grant_rate_disparity_gender: float | None = None
    judge_grant_rate_disparity_region: float | None = None
    override_rate_by_gender: dict
    override_rate_by_region: dict
    override_disparity_gender: float | None = None
    override_disparity_region: float | None = None
    flags: list[str]


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


@app.post("/judge/decision", response_model=JudgeDecisionResponse)
def submit_judge_decision(
    payload: JudgeDecisionRequest,
    current_user: UserPublic = Depends(require_role("judge")),
    conn: sqlite3.Connection = Depends(get_db),
):
    # Ensure case exists
    case_row = conn.execute("SELECT id FROM cases WHERE id = ?;", (payload.case_id,)).fetchone()
    if case_row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found")

    now = datetime.now(timezone.utc).isoformat()
    conn.execute(
        """
        INSERT INTO judge_decisions (case_id, judge_user_id, created_at, decision, notes)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(case_id, judge_user_id) DO UPDATE SET
            created_at=excluded.created_at,
            decision=excluded.decision,
            notes=excluded.notes;
        """,
        (int(payload.case_id), int(current_user.id), now, payload.decision, payload.notes),
    )
    conn.commit()
    return {
        "case_id": int(payload.case_id),
        "judge_user_id": int(current_user.id),
        "decision": payload.decision,
        "notes": payload.notes,
        "created_at": now,
    }


@app.get("/judge/metrics/me", response_model=JudgeMetricsResponse)
def judge_metrics_me(
    current_user: UserPublic = Depends(require_role("judge")),
    conn: sqlite3.Connection = Depends(get_db),
):
    rows = conn.execute(
        """
        SELECT
            c.id as case_id,
            c.accused_gender as accused_gender,
            c.region as region,
            p.decision as ai_decision,
            jd.decision as judge_decision
        FROM cases c
        JOIN ai_predictions p ON p.case_id = c.id
        LEFT JOIN judge_decisions jd
            ON jd.case_id = c.id AND jd.judge_user_id = ?
        ORDER BY c.id DESC;
        """,
        (int(current_user.id),),
    ).fetchall()

    total = len(rows)
    decided = sum(1 for r in rows if r["judge_decision"] is not None)
    agreements = sum(1 for r in rows if r["judge_decision"] is not None and r["judge_decision"] == r["ai_decision"])
    disagreements = sum(1 for r in rows if r["judge_decision"] is not None and r["judge_decision"] != r["ai_decision"])

    denom = decided if decided > 0 else None
    agreement_rate = (agreements / denom) if denom else None
    disagreement_rate = (disagreements / denom) if denom else None

    MIN_GROUP = 5

    def _rate_disparity(rate_map: dict) -> float | None:
        vals = [v for v in rate_map.values() if v is not None]
        if len(vals) < 2:
            return None
        return float(max(vals) - min(vals))

    def _grant_rates_by(key: str) -> dict:
        # grant_rate = granted / decided for each bucket (only if bucket.decided >= MIN_GROUP)
        counts = {}
        for r in rows:
            bucket = (r[key] or "unknown").strip() if isinstance(r[key], str) else (r[key] or "unknown")
            if bucket == "":
                bucket = "unknown"
            counts.setdefault(bucket, {"decided": 0, "granted": 0})
            if r["judge_decision"] is not None:
                counts[bucket]["decided"] += 1
                if r["judge_decision"] == "Bail Granted":
                    counts[bucket]["granted"] += 1

        out_rates = {}
        for b, c in counts.items():
            if c["decided"] >= MIN_GROUP:
                out_rates[b] = c["granted"] / c["decided"] if c["decided"] else None
            else:
                out_rates[b] = None
        return out_rates

    def _override_rates_by(key: str) -> dict:
        # override_rate = overrides / decided for each bucket
        counts = {}
        for r in rows:
            bucket = (r[key] or "unknown").strip() if isinstance(r[key], str) else (r[key] or "unknown")
            if bucket == "":
                bucket = "unknown"
            counts.setdefault(bucket, {"decided": 0, "override": 0})
            if r["judge_decision"] is not None:
                counts[bucket]["decided"] += 1
                if r["judge_decision"] != r["ai_decision"]:
                    counts[bucket]["override"] += 1

        out_rates = {}
        for b, c in counts.items():
            if c["decided"] >= MIN_GROUP:
                out_rates[b] = c["override"] / c["decided"] if c["decided"] else None
            else:
                out_rates[b] = None
        return out_rates

    def _bucket_counts(key: str):
        out = {}
        for r in rows:
            k = (r[key] or "unknown").strip() if isinstance(r[key], str) else (r[key] or "unknown")
            if k == "":
                k = "unknown"
            out.setdefault(k, {"total": 0, "decided": 0, "agree": 0, "disagree": 0})
            out[k]["total"] += 1
            if r["judge_decision"] is not None:
                out[k]["decided"] += 1
                if r["judge_decision"] == r["ai_decision"]:
                    out[k]["agree"] += 1
                else:
                    out[k]["disagree"] += 1
        return out

    judge_grant_rate_by_gender = _grant_rates_by("accused_gender")
    judge_grant_rate_by_region = _grant_rates_by("region")
    override_rate_by_gender = _override_rates_by("accused_gender")
    override_rate_by_region = _override_rates_by("region")

    disparity_gender = _rate_disparity(judge_grant_rate_by_gender)
    disparity_region = _rate_disparity(judge_grant_rate_by_region)
    override_disp_gender = _rate_disparity(override_rate_by_gender)
    override_disp_region = _rate_disparity(override_rate_by_region)

    flags: list[str] = []
    if decided >= 10:
        if disparity_gender is not None and disparity_gender >= 0.2:
            flags.append("Potential gender disparity in judge grant rate (>= 20pp)")
        if disparity_region is not None and disparity_region >= 0.2:
            flags.append("Potential region disparity in judge grant rate (>= 20pp)")
        if override_disp_gender is not None and override_disp_gender >= 0.25:
            flags.append("Potential gender disparity in overrides (>= 25pp)")
        if override_disp_region is not None and override_disp_region >= 0.25:
            flags.append("Potential region disparity in overrides (>= 25pp)")
    else:
        flags.append("Not enough decided cases for disparity signals (need >= 10)")

    return {
        "judge_user_id": int(current_user.id),
        "total_cases_with_ai": total,
        "decided_cases": decided,
        "agreement_rate": agreement_rate,
        "disagreement_rate": disagreement_rate,
        "by_gender": _bucket_counts("accused_gender"),
        "by_region": _bucket_counts("region"),
        "judge_grant_rate_by_gender": judge_grant_rate_by_gender,
        "judge_grant_rate_by_region": judge_grant_rate_by_region,
        "judge_grant_rate_disparity_gender": disparity_gender,
        "judge_grant_rate_disparity_region": disparity_region,
        "override_rate_by_gender": override_rate_by_gender,
        "override_rate_by_region": override_rate_by_region,
        "override_disparity_gender": override_disp_gender,
        "override_disparity_region": override_disp_region,
        "flags": flags,
    }


@app.get("/authority/metrics/judges")
def authority_metrics_judges(
    current_user: UserPublic = Depends(require_role("court_authority")),
    conn: sqlite3.Connection = Depends(get_db),
):
    # Aggregate for all judges: total decided, agreement rate, and disparity signals.
    judges = conn.execute("SELECT id, username, full_name FROM users WHERE role = 'judge';").fetchall()
    out = []
    for j in judges:
        rows = conn.execute(
            """
            SELECT
                c.accused_gender as accused_gender,
                c.region as region,
                p.decision as ai_decision,
                jd.decision as judge_decision
            FROM cases c
            JOIN ai_predictions p ON p.case_id = c.id
            JOIN judge_decisions jd ON jd.case_id = c.id AND jd.judge_user_id = ?
            """,
            (int(j["id"]),),
        ).fetchall()
        decided = len(rows)
        agree = sum(1 for r in rows if r["judge_decision"] == r["ai_decision"])
        disagree = decided - agree

        MIN_GROUP = 5

        def _rate_disparity(rate_map: dict) -> float | None:
            vals = [v for v in rate_map.values() if v is not None]
            if len(vals) < 2:
                return None
            return float(max(vals) - min(vals))

        def _grant_rates_by(key: str) -> dict:
            counts = {}
            for r in rows:
                bucket = (r[key] or "unknown").strip() if isinstance(r[key], str) else (r[key] or "unknown")
                if bucket == "":
                    bucket = "unknown"
                counts.setdefault(bucket, {"decided": 0, "granted": 0})
                counts[bucket]["decided"] += 1
                if r["judge_decision"] == "Bail Granted":
                    counts[bucket]["granted"] += 1
            out_rates = {}
            for b, c in counts.items():
                if c["decided"] >= MIN_GROUP:
                    out_rates[b] = c["granted"] / c["decided"] if c["decided"] else None
                else:
                    out_rates[b] = None
            return out_rates

        def _override_rates_by(key: str) -> dict:
            counts = {}
            for r in rows:
                bucket = (r[key] or "unknown").strip() if isinstance(r[key], str) else (r[key] or "unknown")
                if bucket == "":
                    bucket = "unknown"
                counts.setdefault(bucket, {"decided": 0, "override": 0})
                counts[bucket]["decided"] += 1
                if r["judge_decision"] != r["ai_decision"]:
                    counts[bucket]["override"] += 1
            out_rates = {}
            for b, c in counts.items():
                if c["decided"] >= MIN_GROUP:
                    out_rates[b] = c["override"] / c["decided"] if c["decided"] else None
                else:
                    out_rates[b] = None
            return out_rates

        grant_gender = _grant_rates_by("accused_gender")
        grant_region = _grant_rates_by("region")
        override_gender = _override_rates_by("accused_gender")
        override_region = _override_rates_by("region")

        flags: list[str] = []
        if decided >= 10:
            dg = _rate_disparity(grant_gender)
            dr = _rate_disparity(grant_region)
            og = _rate_disparity(override_gender)
            orr = _rate_disparity(override_region)
            if dg is not None and dg >= 0.2:
                flags.append("Potential gender disparity (grant rate)")
            if dr is not None and dr >= 0.2:
                flags.append("Potential region disparity (grant rate)")
            if og is not None and og >= 0.25:
                flags.append("Potential gender disparity (overrides)")
            if orr is not None and orr >= 0.25:
                flags.append("Potential region disparity (overrides)")
        else:
            flags.append("Not enough decided cases (need >= 10)")

        out.append(
            {
                "judge_user_id": int(j["id"]),
                "username": j["username"],
                "full_name": j["full_name"],
                "decided_cases": decided,
                "agreement_rate": (agree / decided) if decided else None,
                "disagreement_rate": (disagree / decided) if decided else None,
                "grant_rate_disparity_gender": _rate_disparity(grant_gender),
                "grant_rate_disparity_region": _rate_disparity(grant_region),
                "override_disparity_gender": _rate_disparity(override_gender),
                "override_disparity_region": _rate_disparity(override_region),
                "flags": flags,
            }
        )

    return {"judges": out}



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
        REQUIRED_COLS = [
            "legal_principles_discussed", "accused_gender", "region", "legal_text",
            "ipc_sections", "facts", "date", "bail_cancellation_case", "summary",
            "legal_issues", "crime_type", "prior_cases", "bail_outcome_label_detailed",
            "court", "judgment_reason", "landmark_case", "special_laws", "bail_type",
            "bias_flag", "parity_argument_used", "judge"
        ]

        DEFAULTS = {
            "legal_principles_discussed": "",
            "ipc_sections": "",
            "bail_cancellation_case": 0,
            "summary": "",
            "legal_issues": "",
            "crime_type": "",
            "prior_cases": 0,
            "bail_outcome_label_detailed": 0,
            "court": "",
            "judgment_reason": "",
            "landmark_case": "",
            "special_laws": "",
            "bail_type": "",
            "bias_flag": 0,
            "parity_argument_used": 0,
            "judge": "",
        }

        # Build clean row
        row = {}

        for col in REQUIRED_COLS:
            value = payload.get(col, DEFAULTS.get(col, ""))

            # Replace empty strings with None
            if value == "":
                value = None

            row[col] = value

        # Build legal_text safely
        row["legal_text"] = " ".join([
            str(row.get("facts") or ""),
            str(row.get("legal_issues") or ""),
            str(row.get("judgment_reason") or ""),
            str(row.get("summary") or "")
        ]).strip()

        case_df = pd.DataFrame([row])

        # 🔥 FORCE NUMERIC TYPES SAFELY
        numeric_cols = [
            "prior_cases",
            "bail_cancellation_case",
            "bias_flag",
            "parity_argument_used",
            "bail_outcome_label_detailed"
        ]

        for col in numeric_cols:
            case_df[col] = pd.to_numeric(case_df[col], errors="coerce")
            case_df[col] = case_df[col].fillna(0)
            case_df[col] = case_df[col].astype("float64")

        proba = model.predict_proba(case_df)[0]
        pred = int(proba[1] >= 0.5)

        # ---- SHAP explanation (best-effort) ----
        top_features = []
        shap_error = None
        try:
            shap_df = sanitize_for_shap(case_df)
            explainer = get_shap_explainer(shap_df)
            if explainer is not None:
                X_explain = shap_df
                if shap_use_transform and shap_preprocessor is not None:
                    X_explain = shap_preprocessor.transform(shap_df)
                    if hasattr(X_explain, "toarray"):
                        X_explain = X_explain.toarray()
                    X_explain = np.asarray(X_explain, dtype=np.float32)

                # TreeExplainer works best with shap_values API (binary -> list or array)
                if hasattr(explainer, "shap_values"):
                    sv = explainer.shap_values(X_explain)
                    if isinstance(sv, list):
                        arr = np.array(sv[1] if len(sv) > 1 else sv[0])
                    else:
                        arr = np.array(sv)
                else:
                    shap_values = explainer(X_explain)
                    values = getattr(shap_values, "values", shap_values)
                    arr = np.array(values)

                # Handle common SHAP output shapes
                if arr.ndim == 2:
                    row_vals = arr[0]
                elif arr.ndim == 3:
                    # [samples, classes, features] -> pick positive class (1) if available
                    class_idx = 1 if arr.shape[1] > 1 else 0
                    row_vals = arr[0, class_idx, :]
                else:
                    row_vals = arr.reshape(-1)

                feature_names = list(shap_feature_names) if shap_feature_names else list(shap_df.columns)
                contribs = [
                    {
                        "feature": feature_names[i],
                        "weight": float(row_vals[i]),
                    }
                    for i in range(min(len(feature_names), len(row_vals)))
                ]
                contribs.sort(key=lambda x: abs(x["weight"]), reverse=True)
                top_features = contribs[:10]
            else:
                shap_error = shap_init_error or "SHAP explainer could not be initialized for this model."
        except Exception as e:
            shap_error = str(e)
            top_features = []

        result = {
            "decision": "Bail Granted" if pred == 1 else "Bail Rejected",
            "confidence": round(float(max(proba)), 3),
            "prob_granted": round(float(proba[1]), 3),
            "prob_rejected": round(float(proba[0]), 3),
            "top_features": top_features,
            "shap_error": shap_error,
        }

        # Persist case + prediction (best-effort; won't fail prediction if DB insert fails)
        try:
            conn = _get_db_conn()
            try:
                now = datetime.now(timezone.utc).isoformat()
                payload_json = json.dumps(payload)
                cur = conn.execute(
                    """
                    INSERT INTO cases (created_at, created_by_user_id, payload_json, accused_gender, region, court, date)
                    VALUES (?, ?, ?, ?, ?, ?, ?);
                    """,
                    (
                        now,
                        int(_current_user.id),
                        payload_json,
                        str(payload.get("accused_gender") or ""),
                        str(payload.get("region") or ""),
                        str(payload.get("court") or ""),
                        str(payload.get("date") or ""),
                    ),
                )
                case_id = int(cur.lastrowid)

                conn.execute(
                    """
                    INSERT INTO ai_predictions (case_id, created_at, decision, confidence, prob_granted, prob_rejected, shap_json)
                    VALUES (?, ?, ?, ?, ?, ?, ?);
                    """,
                    (
                        case_id,
                        now,
                        result["decision"],
                        float(result["confidence"]),
                        float(result["prob_granted"]),
                        float(result["prob_rejected"]),
                        json.dumps(result.get("top_features") or []),
                    ),
                )
                conn.commit()
                result["case_id"] = case_id
            finally:
                conn.close()
        except Exception:
            pass

        return result

        

    except Exception as e:
        return {"error": str(e)}
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