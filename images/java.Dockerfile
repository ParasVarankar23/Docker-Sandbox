FROM eclipse-temurin:17-jdk-alpine
RUN adduser -D sandbox
USER sandbox
WORKDIR /app
CMD ["sh", "-c", "javac Main.java && java Main"]