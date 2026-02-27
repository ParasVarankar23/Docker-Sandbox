FROM python:3.11-alpine
RUN adduser -D sandbox
USER sandbox
WORKDIR /app
CMD ["python3", "Main.py"]