FROM postgres:18.2-alpine3.23

RUN set -eux; \
  apk add --no-cache su-exec; \
  rm -f /usr/local/bin/gosu; \
  ln -s /sbin/su-exec /usr/local/bin/gosu
