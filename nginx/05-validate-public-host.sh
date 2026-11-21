#!/bin/sh
# Validate the canonical hostname before nginx renders production templates (#1973).
set -eu

if [ "${ERP_PUBLIC_HOST+x}" != x ]; then
    exit 0
fi

# Limit labels to DNS hostname characters and exclude numeric IP forms.
if ! LC_ALL=C awk '
    BEGIN {
        host = ENVIRON["ERP_PUBLIC_HOST"]
        if (length(host) > 253 || host !~ /^[a-zA-Z0-9.-]+$/) exit 1
        count = split(host, labels, "[.]")
        ip_literal = 1
        for (i = 1; i <= count; i++) {
            label = labels[i]
            if (length(label) > 63 ||
                label !~ /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?$/) exit 1
            if (label !~ /^([0-9]+|0[xX][0-9a-fA-F]+)$/) ip_literal = 0
        }
        exit ip_literal
    }
'; then
    echo 'ERP_PUBLIC_HOST must be a bare DNS hostname' >&2
    exit 1
fi
