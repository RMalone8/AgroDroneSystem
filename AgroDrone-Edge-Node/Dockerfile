FROM python:3.11-slim-bookworm
WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY src/ ./src/

# Default command runs both the flight plan listener (background) and
# a periodic telemetry publisher. Override CMD in compose for specific services.
CMD ["python", "src/flight_plan.py"]
