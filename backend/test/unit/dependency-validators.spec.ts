import { json } from '@angular-devkit/core';
import { FileTypeValidator } from '@nestjs/common';

describe('Nest file signature validation', () => {
  const mimetype = 'image/png';

  it('accepts a PNG by its file signature', async () => {
    const validator = new FileTypeValidator({ fileType: mimetype });
    const buffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',
      'base64',
    );

    await expect(
      validator.isValid({ mimetype, buffer, size: buffer.length }),
    ).resolves.toBe(true);
  });

  it('rejects plain text declared as a PNG', async () => {
    const validator = new FileTypeValidator({ fileType: mimetype });
    const buffer = Buffer.from('plain text');

    await expect(
      validator.isValid({ mimetype, buffer, size: buffer.length }),
    ).resolves.toBe(false);
  });
});

describe('Angular devkit schema validation', () => {
  it('compiles a schema reference and validates the referenced format', async () => {
    const registry = new json.schema.CoreSchemaRegistry();
    const uri = 'https://example.invalid/email-schema.json';
    registry.registerUriHandler((requestedUri) =>
      requestedUri === uri
        ? Promise.resolve({ $id: uri, type: 'string', format: 'email' })
        : undefined,
    );

    const validate = await registry.compile({ $ref: uri });

    await expect(validate('person@example.com')).resolves.toMatchObject({
      success: true,
    });
    await expect(validate('invalid')).resolves.toMatchObject({
      success: false,
      errors: [expect.objectContaining({ keyword: 'format' })],
    });
  });

  it('returns validation errors for an async schema', async () => {
    const registry = new json.schema.CoreSchemaRegistry();
    const validate = await registry.compile({ $async: true, type: 'integer' });

    await expect(validate('invalid')).resolves.toMatchObject({
      success: false,
      errors: [expect.objectContaining({ keyword: 'type' })],
    });
  });
});
