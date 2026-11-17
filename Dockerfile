FROM python:3.11-slim

WORKDIR /app

# No dependencies: stdlib only.
COPY server.py ./
COPY public ./public
COPY mods ./mods

ENV PORT=8080
EXPOSE 8080

CMD ["python", "server.py", "--no-wizard", "--no-browser", "--host", "0.0.0.0"]