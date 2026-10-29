# SmartPark Streamlit migration prototype

## Safety / scope

- This is an **additional prototype** on the `streamlit-migration` branch.
- The existing React + Flask application and its files are not modified or deleted.
- The prototype reuses the existing SQLAlchemy models and availability rules.
- It supports sign-in using existing database accounts, viewing parking locations and slot availability, and owner-only manual slot-status simulation.
- It does **not** yet migrate registration, creating/cancelling reservations, location management, analytics, or physical sensor integration. Use the original application for those features.
- It does not seed, reset, or delete records automatically.

## Run locally on Windows

From the repository root in PowerShell:

```powershell
py -m venv .venv-streamlit
.\.venv-streamlit\Scripts\Activate.ps1
py -m pip install -r requirements.txt
streamlit run streamlit_app.py
```

If PowerShell blocks activation, run the app using the environment's Python directly:

```powershell
.\.venv-streamlit\Scripts\python.exe -m pip install -r requirements.txt
.\.venv-streamlit\Scripts\python.exe -m streamlit run streamlit_app.py
```

## Optional local demo data

The existing demo seed script is intentionally not run automatically. If you want its clearly labelled demo accounts and parking locations, first back up your database, then from the `backend` folder run:

```powershell
python seed_demo.py
```

The seed script will ask before adding records if accounts already exist. Demo credentials are documented in `backend/seed_demo.py`; use them only for local demonstration, never for a public deployment.

## Free Streamlit Community Cloud deployment

1. Push this branch to GitHub.
2. In Streamlit Community Cloud, create an app from this repository and choose branch `streamlit-migration`.
3. Set the app file path to `streamlit_app.py`.
4. Deploy.

**Important database limitation:** the current project uses SQLite at `backend/data/smartpark.db`. A hosted Streamlit app's local filesystem is not a reliable permanent database for production. A fresh cloud deployment may have no existing accounts or parking locations, and local database changes may not persist across rebuilds. For persistent multi-user bookings, connect a hosted persistent database before using this publicly. Do not upload a real database or real user data to GitHub.
