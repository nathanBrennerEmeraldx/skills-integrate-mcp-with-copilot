"""High School Management System API."""

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import RedirectResponse
import os
from pathlib import Path
import hashlib
import secrets

from pydantic import BaseModel, EmailStr

app = FastAPI(title="Mergington High School API",
              description="API for viewing and signing up for extracurricular activities")

# Mount the static files directory
current_dir = Path(__file__).parent
app.mount("/static", StaticFiles(directory=os.path.join(Path(__file__).parent,
          "static")), name="static")

# In-memory activity database
activities = {
    "Chess Club": {
        "description": "Learn strategies and compete in chess tournaments",
        "schedule": "Fridays, 3:30 PM - 5:00 PM",
        "max_participants": 12,
        "participants": ["michael@mergington.edu", "daniel@mergington.edu"]
    },
    "Programming Class": {
        "description": "Learn programming fundamentals and build software projects",
        "schedule": "Tuesdays and Thursdays, 3:30 PM - 4:30 PM",
        "max_participants": 20,
        "participants": ["emma@mergington.edu", "sophia@mergington.edu"]
    },
    "Gym Class": {
        "description": "Physical education and sports activities",
        "schedule": "Mondays, Wednesdays, Fridays, 2:00 PM - 3:00 PM",
        "max_participants": 30,
        "participants": ["john@mergington.edu", "olivia@mergington.edu"]
    },
    "Soccer Team": {
        "description": "Join the school soccer team and compete in matches",
        "schedule": "Tuesdays and Thursdays, 4:00 PM - 5:30 PM",
        "max_participants": 22,
        "participants": ["liam@mergington.edu", "noah@mergington.edu"]
    },
    "Basketball Team": {
        "description": "Practice and play basketball with the school team",
        "schedule": "Wednesdays and Fridays, 3:30 PM - 5:00 PM",
        "max_participants": 15,
        "participants": ["ava@mergington.edu", "mia@mergington.edu"]
    },
    "Art Club": {
        "description": "Explore your creativity through painting and drawing",
        "schedule": "Thursdays, 3:30 PM - 5:00 PM",
        "max_participants": 15,
        "participants": ["amelia@mergington.edu", "harper@mergington.edu"]
    },
    "Drama Club": {
        "description": "Act, direct, and produce plays and performances",
        "schedule": "Mondays and Wednesdays, 4:00 PM - 5:30 PM",
        "max_participants": 20,
        "participants": ["ella@mergington.edu", "scarlett@mergington.edu"]
    },
    "Math Club": {
        "description": "Solve challenging problems and participate in math competitions",
        "schedule": "Tuesdays, 3:30 PM - 4:30 PM",
        "max_participants": 10,
        "participants": ["james@mergington.edu", "benjamin@mergington.edu"]
    },
    "Debate Team": {
        "description": "Develop public speaking and argumentation skills",
        "schedule": "Fridays, 4:00 PM - 5:30 PM",
        "max_participants": 12,
        "participants": ["charlotte@mergington.edu", "henry@mergington.edu"]
    }
}

ROLES = {"member", "admin", "supervisor"}


def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode("utf-8")).hexdigest()


users = {
    "member@mergington.edu": {
        "password_hash": hash_password("member123"),
        "role": "member",
    },
    "admin@mergington.edu": {
        "password_hash": hash_password("admin123"),
        "role": "admin",
    },
    "supervisor@mergington.edu": {
        "password_hash": hash_password("supervisor123"),
        "role": "supervisor",
    },
}

active_sessions = {}


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    role: str = "member"


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


def get_current_user(authorization: str | None = Header(default=None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid authorization header")

    token = authorization.removeprefix("Bearer ").strip()
    email = active_sessions.get(token)
    if not email:
        raise HTTPException(status_code=401, detail="Invalid or expired session token")

    user_record = users.get(email)
    if not user_record:
        raise HTTPException(status_code=401, detail="User not found")

    return {"email": email, "role": user_record["role"]}


def require_roles(*allowed_roles):
    def role_dependency(current_user=Depends(get_current_user)):
        if current_user["role"] not in allowed_roles:
            raise HTTPException(status_code=403, detail="You do not have permission for this action")
        return current_user

    return role_dependency


@app.get("/")
def root():
    return RedirectResponse(url="/static/index.html")


@app.get("/activities")
def get_activities():
    return activities


@app.post("/auth/register")
def register_user(payload: RegisterRequest):
    email = payload.email.lower()
    role = payload.role.lower()

    if role not in ROLES:
        raise HTTPException(status_code=400, detail="Invalid role")

    if role != "member":
        raise HTTPException(status_code=403, detail="Self-registration only supports member role")

    if email in users:
        raise HTTPException(status_code=400, detail="User already exists")

    users[email] = {
        "password_hash": hash_password(payload.password),
        "role": role,
    }
    return {"message": "Registration successful", "email": email, "role": role}


@app.post("/auth/login")
def login_user(payload: LoginRequest):
    email = payload.email.lower()
    user_record = users.get(email)
    if not user_record or user_record["password_hash"] != hash_password(payload.password):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = secrets.token_urlsafe(32)
    active_sessions[token] = email

    return {
        "message": "Login successful",
        "token": token,
        "user": {
            "email": email,
            "role": user_record["role"],
        },
    }


@app.post("/auth/logout")
def logout_user(current_user=Depends(get_current_user), authorization: str | None = Header(default=None)):
    token = authorization.removeprefix("Bearer ").strip()
    active_sessions.pop(token, None)
    return {"message": f"Logged out {current_user['email']}"}


@app.get("/auth/me")
def get_me(current_user=Depends(get_current_user)):
    return current_user


@app.post("/activities/{activity_name}/signup")
def signup_for_activity(
    activity_name: str,
    email: EmailStr,
    current_user=Depends(require_roles("member", "admin", "supervisor")),
):
    """Sign up a student for an activity"""
    # Validate activity exists
    if activity_name not in activities:
        raise HTTPException(status_code=404, detail="Activity not found")

    target_email = str(email).lower()

    if current_user["role"] == "member" and target_email != current_user["email"]:
        raise HTTPException(status_code=403, detail="Members can only sign themselves up")

    # Get the specific activity
    activity = activities[activity_name]

    # Validate student is not already signed up
    if target_email in activity["participants"]:
        raise HTTPException(
            status_code=400,
            detail="Student is already signed up"
        )

    if len(activity["participants"]) >= activity["max_participants"]:
        raise HTTPException(status_code=400, detail="Activity is full")

    # Add student
    activity["participants"].append(target_email)
    return {"message": f"Signed up {target_email} for {activity_name}"}


@app.delete("/activities/{activity_name}/unregister")
def unregister_from_activity(
    activity_name: str,
    email: EmailStr,
    current_user=Depends(require_roles("member", "admin", "supervisor")),
):
    """Unregister a student from an activity"""
    # Validate activity exists
    if activity_name not in activities:
        raise HTTPException(status_code=404, detail="Activity not found")

    target_email = str(email).lower()

    if current_user["role"] == "member" and target_email != current_user["email"]:
        raise HTTPException(status_code=403, detail="Members can only unregister themselves")

    # Get the specific activity
    activity = activities[activity_name]

    # Validate student is signed up
    if target_email not in activity["participants"]:
        raise HTTPException(
            status_code=400,
            detail="Student is not signed up for this activity"
        )

    # Remove student
    activity["participants"].remove(target_email)
    return {"message": f"Unregistered {target_email} from {activity_name}"}
