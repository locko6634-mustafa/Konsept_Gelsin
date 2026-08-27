FROM nginx:stable-alpine@sha256:97d490c12ba55b4946b01546d1c3ed324e8d41ab1c9fcb2a616aa470620e5b46

ARG BUILD_REVISION=unknown

LABEL org.opencontainers.image.title="Konsept Gelsin"
LABEL org.opencontainers.image.revision="${BUILD_REVISION}"

RUN rm -rf /usr/share/nginx/html/*

COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html /usr/share/nginx/html/index.html
COPY css /usr/share/nginx/html/css
COPY js /usr/share/nginx/html/js
COPY assets/fonts /usr/share/nginx/html/assets/fonts

RUN chown -R nginx:nginx \
      /etc/nginx/conf.d \
      /usr/share/nginx/html \
      /var/cache/nginx \
      /run \
      /var/run

USER nginx
EXPOSE 8080
STOPSIGNAL SIGQUIT

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:8080/healthz || exit 1
