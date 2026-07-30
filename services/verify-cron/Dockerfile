FROM docker:27-cli

# Install bash, curl, jq, and supercronic (reliable cron for containers)
RUN apk add --no-cache bash curl jq

# Download supercronic (better cron for Docker — handles signals, logs to stdout)
ENV SUPERCRONIC_URL=https://github.com/aptible/supercronic/releases/download/v0.2.33/supercronic-linux-amd64 \
    SUPERCRONIC=/usr/local/bin/supercronic
RUN curl -fsSL "$SUPERCRONIC_URL" -o "$SUPERCRONIC" \
 && chmod +x "$SUPERCRONIC"

# Create log directory
RUN mkdir -p /var/log/verify-restore

# Copy scripts
COPY scripts/ /scripts/
RUN chmod +x /scripts/*.sh

# Copy crontab
COPY services/verify-cron/crontab /etc/crontab/verify-restore

ENTRYPOINT ["/usr/local/bin/supercronic", "/etc/crontab/verify-restore"]
