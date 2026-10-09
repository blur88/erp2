# The capture container for the upstream-arrival evidence (#1353).
#
# It shares the backend's network namespace (--net container:erp_backend), so it
# sees the ingress-to-backend traffic, and it is the only thing that ever holds
# it: tshark's output is piped straight into capture/reduce.mjs, which keeps a
# fingerprint of each token and nothing else.
#
# Built for: nodejs, tshark, ethtool and iproute2 from the alpine:3.23
# repositories. The exact
# versions a build resolved are recorded in every capture's health record, so a
# capture says which decoder produced it.
FROM alpine:3.23

RUN apk add --no-cache nodejs tshark ethtool iproute2

# Read-only mount point for the reducer; the image carries nothing of its own.
WORKDIR /capture
COPY reduce.mjs entrypoint.sh /capture/
RUN chmod +x /capture/entrypoint.sh

# The root filesystem is mounted read-only and TMPDIR is a tmpfs, so the
# capture's own temporary files cannot reach a disk-backed filesystem.
ENV TMPDIR=/tmp

ENTRYPOINT ["/capture/entrypoint.sh"]
