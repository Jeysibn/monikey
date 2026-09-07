#!/bin/sh
set -eu

resolver="${NGINX_DNS_RESOLVER:-127.0.0.11}"
sed -i "s/__NGINX_DNS_RESOLVER__/${resolver}/g" /etc/nginx/conf.d/default.conf

# Nginx's explicit `resolver` lookup does not use the pod's DNS search
# domains.  In Kubernetes, qualify the API service name so `/api/*` requests
# work reliably; keep the short Docker Compose name for local development.
if [ -r /var/run/secrets/kubernetes.io/serviceaccount/namespace ]; then
    namespace=$(cat /var/run/secrets/kubernetes.io/serviceaccount/namespace)
    api_host="api.${namespace}.svc.cluster.local"
    sed -i "s#http://api:3000#http://${api_host}:3000#g" /etc/nginx/conf.d/default.conf
fi
