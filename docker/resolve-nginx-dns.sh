#!/bin/sh
set -eu

resolver="${NGINX_DNS_RESOLVER:-127.0.0.11}"
sed -i "s/__NGINX_DNS_RESOLVER__/${resolver}/g" /etc/nginx/conf.d/default.conf
