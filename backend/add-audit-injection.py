#!/usr/bin/env python3
import re
import sys

def add_audit_service_to_constructor(filepath):
    """Add AuditLogService to constructor if not already present"""
    with open(filepath, 'r') as f:
        content = f.read()

    # Check if already has auditLogService in constructor
    if 'auditLogService' in content:
        print(f"  {filepath}: Already has auditLogService")
        return False

    # Find constructor
    constructor_pattern = r'(constructor\s*\([^)]*)(private readonly [^)]+\))\s*\{\}'
    match = re.search(constructor_pattern, content, re.DOTALL)

    if not match:
        print(f"  {filepath}: Constructor pattern not found")
        return False

    # Add auditLogService injection before the closing parenthesis
    replacement = r'\1\2,\n    private readonly auditLogService: AuditLogService,\n  ) {}'
    new_content = re.sub(constructor_pattern, replacement, content, count=1, flags=re.DOTALL)

    with open(filepath, 'w') as f:
        f.write(new_content)

    print(f"  {filepath}: Added auditLogService to constructor")
    return True

services = [
    "src/modules/sales/services/sales-order.service.ts",
    "src/modules/sales/services/invoice.service.ts",
    "src/modules/sales/services/payment.service.ts",
    "src/modules/purchasing/services/supplier.service.ts",
    "src/modules/purchasing/services/purchase-order.service.ts",
    "src/modules/purchasing/services/goods-received-note.service.ts",
    "src/modules/purchasing/services/vendor-payment.service.ts",
    "src/modules/inventory/services/category.service.ts",
    "src/modules/inventory/services/stock-adjustment.service.ts",
]

for service in services:
    try:
        add_audit_service_to_constructor(service)
    except Exception as e:
        print(f"  {service}: Error - {e}")

print("Done!")
