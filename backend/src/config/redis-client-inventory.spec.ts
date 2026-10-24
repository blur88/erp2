import { readdirSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import ts from 'typescript';

const sourceRoot = resolve(process.cwd(), 'src');

const productionFiles = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return productionFiles(path);
    if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) {
      return [path];
    }
    return [];
  });

const sources = productionFiles(sourceRoot).map((file) => ({
  file: relative(sourceRoot, file).replaceAll('\\', '/'),
  source: ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true),
}));

const unwrap = (node: ts.Expression): ts.Expression => {
  while (
    ts.isAsExpression(node) ||
    ts.isTypeAssertionExpression(node) ||
    ts.isParenthesizedExpression(node) ||
    ts.isAwaitExpression(node) ||
    ts.isSatisfiesExpression(node)
  ) {
    node = node.expression;
  }
  return node;
};

const staticMemberName = (node: ts.Expression | undefined): string | undefined => {
  if (!node) return undefined;
  const expression = unwrap(node);
  return ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)
    ? expression.text
    : undefined;
};

const bindingNames = (name: ts.BindingName): string[] => {
  if (ts.isIdentifier(name)) return [name.text];
  return name.elements.flatMap((element) =>
    ts.isOmittedExpression(element) ? [] : bindingNames(element.name),
  );
};

const isPackageSpecifier = (specifier: string, packageName: string): boolean =>
  specifier === packageName || specifier.startsWith(`${packageName}/`);

const isRequireLoader = (node: ts.Expression, aliases: Set<string>): boolean => {
  const expression = unwrap(node);
  if (
    (ts.isIdentifier(expression) && aliases.has(expression.text)) ||
    (ts.isPropertyAccessExpression(expression) &&
      ts.isIdentifier(expression.expression) &&
      expression.expression.text === 'module' &&
      expression.name.text === 'require')
  ) {
    return true;
  }
  return (
    ts.isCallExpression(expression) &&
    ts.isPropertyAccessExpression(expression.expression) &&
    expression.expression.name.text === 'bind' &&
    isRequireLoader(expression.expression.expression, aliases)
  );
};

type CreateRequireFactories = {
  names: Set<string>;
  namespaces: Set<string>;
  requireAliases: Set<string>;
};

const commonJsRequireLoaderAliases = (source: ts.SourceFile): Set<string> => {
  const aliases = new Set(['require']);
  let changed = true;
  while (changed) {
    changed = false;
    const visit = (node: ts.Node) => {
      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.initializer &&
        isRequireLoader(node.initializer, aliases)
      ) {
        const sizeBefore = aliases.size;
        aliases.add(node.name.text);
        changed = aliases.size !== sizeBefore || changed;
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return aliases;
};

const isNodeModuleRequireLoad = (
  expression: ts.Expression,
  requireAliases: Set<string>,
): boolean => {
  const node = unwrap(expression);
  return (
    ts.isCallExpression(node) &&
    isRequireLoader(node.expression, requireAliases) &&
    ['module', 'node:module'].includes(staticMemberName(node.arguments[0]) ?? '')
  );
};

const isNodeModuleDynamicImport = (expression: ts.Expression): boolean => {
  const node = unwrap(expression);
  return (
    ts.isCallExpression(node) &&
    node.expression.kind === ts.SyntaxKind.ImportKeyword &&
    ['module', 'node:module'].includes(staticMemberName(node.arguments[0]) ?? '')
  );
};

const createRequireFactoryAliases = (source: ts.SourceFile): CreateRequireFactories => {
  const factories: CreateRequireFactories = {
    names: new Set(),
    namespaces: new Set(),
    requireAliases: commonJsRequireLoaderAliases(source),
  };
  for (const statement of source.statements) {
    if (
      ts.isImportEqualsDeclaration(statement) &&
      !statement.isTypeOnly &&
      ts.isExternalModuleReference(statement.moduleReference) &&
      ts.isStringLiteral(statement.moduleReference.expression) &&
      ['module', 'node:module'].includes(statement.moduleReference.expression.text)
    ) {
      factories.namespaces.add(statement.name.text);
      continue;
    }
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      !['module', 'node:module'].includes(statement.moduleSpecifier.text) ||
      !statement.importClause ||
      statement.importClause.isTypeOnly
    ) {
      continue;
    }
    const bindings = statement.importClause.namedBindings;
    if (statement.importClause.name) {
      factories.namespaces.add(statement.importClause.name.text);
    }
    if (bindings && ts.isNamespaceImport(bindings)) {
      factories.namespaces.add(bindings.name.text);
    }
    if (bindings && ts.isNamedImports(bindings)) {
      for (const element of bindings.elements) {
        if (element.isTypeOnly) continue;
        const importedName = (element.propertyName ?? element.name).text;
        if (importedName === 'createRequire') factories.names.add(element.name.text);
        if (importedName === 'Module' || importedName === 'default') {
          factories.namespaces.add(element.name.text);
        }
      }
    }
  }

  let changed = true;
  while (changed) {
    changed = false;
    const visit = (node: ts.Node) => {
      if (ts.isVariableDeclaration(node) && node.initializer) {
        const initializer = unwrap(node.initializer);
        if (
          ts.isIdentifier(node.name) &&
          (isNodeModuleRequireLoad(initializer, factories.requireAliases) ||
            isNodeModuleDynamicImport(initializer))
        ) {
          const sizeBefore = factories.namespaces.size;
          factories.namespaces.add(node.name.text);
          changed = factories.namespaces.size !== sizeBefore || changed;
        }
        if (
          ts.isIdentifier(node.name) &&
          ts.isPropertyAccessExpression(initializer) &&
          initializer.name.text === 'createRequire' &&
          isNodeModuleRequireLoad(initializer.expression, factories.requireAliases)
        ) {
          const sizeBefore = factories.names.size;
          factories.names.add(node.name.text);
          changed = factories.names.size !== sizeBefore || changed;
        }
        if (
          ts.isIdentifier(node.name) &&
          ts.isIdentifier(initializer) &&
          factories.names.has(initializer.text)
        ) {
          const sizeBefore = factories.names.size;
          factories.names.add(node.name.text);
          changed = factories.names.size !== sizeBefore || changed;
        }
        if (
          ts.isIdentifier(node.name) &&
          ts.isIdentifier(initializer) &&
          factories.namespaces.has(initializer.text)
        ) {
          const sizeBefore = factories.namespaces.size;
          factories.namespaces.add(node.name.text);
          changed = factories.namespaces.size !== sizeBefore || changed;
        }
        if (
          ts.isIdentifier(node.name) &&
          ts.isPropertyAccessExpression(initializer) &&
          ts.isIdentifier(initializer.expression) &&
          factories.namespaces.has(initializer.expression.text) &&
          initializer.name.text === 'createRequire'
        ) {
          const sizeBefore = factories.names.size;
          factories.names.add(node.name.text);
          changed = factories.names.size !== sizeBefore || changed;
        }
        if (
          ts.isIdentifier(node.name) &&
          ts.isPropertyAccessExpression(initializer) &&
          (initializer.name.text === 'Module' || initializer.name.text === 'default')
        ) {
          const namespace = unwrap(initializer.expression);
          if (
            (ts.isIdentifier(namespace) && factories.namespaces.has(namespace.text)) ||
            isNodeModuleRequireLoad(namespace, factories.requireAliases) ||
            isNodeModuleDynamicImport(namespace)
          ) {
            const sizeBefore = factories.namespaces.size;
            factories.namespaces.add(node.name.text);
            changed = factories.namespaces.size !== sizeBefore || changed;
          }
        }
        if (
          !ts.isIdentifier(node.name) &&
          (isNodeModuleRequireLoad(initializer, factories.requireAliases) ||
            isNodeModuleDynamicImport(initializer) ||
            (ts.isIdentifier(initializer) && factories.namespaces.has(initializer.text)))
        ) {
          for (const element of node.name.elements) {
            if (ts.isOmittedExpression(element) || !ts.isIdentifier(element.name)) continue;
            const importedName =
              element.propertyName && ts.isIdentifier(element.propertyName)
                ? element.propertyName.text
                : element.propertyName && ts.isStringLiteral(element.propertyName)
                  ? element.propertyName.text
                  : element.name.text;
            if (importedName === 'createRequire') {
              const sizeBefore = factories.names.size;
              factories.names.add(element.name.text);
              changed = factories.names.size !== sizeBefore || changed;
            }
            if (importedName === 'Module' || importedName === 'default') {
              const sizeBefore = factories.namespaces.size;
              factories.namespaces.add(element.name.text);
              changed = factories.namespaces.size !== sizeBefore || changed;
            }
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return factories;
};

const isCreateRequireFactory = (
  expression: ts.Expression,
  factories: CreateRequireFactories,
): boolean => {
  const node = unwrap(expression);
  return (
    (ts.isIdentifier(node) && factories.names.has(node.text)) ||
    (ts.isPropertyAccessExpression(node) &&
      node.name.text === 'createRequire' &&
      ((ts.isIdentifier(node.expression) &&
        factories.namespaces.has(node.expression.text)) ||
        isNodeModuleRequireLoad(node.expression, factories.requireAliases)))
  );
};

const isCreatedRequireLoader = (
  expression: ts.Expression,
  factories: CreateRequireFactories,
): boolean => {
  const node = unwrap(expression);
  if (ts.isCallExpression(node) && isCreateRequireFactory(node.expression, factories)) {
    return true;
  }
  return (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    node.expression.name.text === 'bind' &&
    isCreatedRequireLoader(node.expression.expression, factories)
  );
};

const requireLoaderAliases = (source: ts.SourceFile): Set<string> => {
  const aliases = new Set(['require']);
  const createRequireFactories = createRequireFactoryAliases(source);
  let changed = true;
  while (changed) {
    changed = false;
    const visit = (node: ts.Node) => {
      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.initializer &&
        (isRequireLoader(node.initializer, aliases) ||
          isCreatedRequireLoader(node.initializer, createRequireFactories))
      ) {
        const sizeBefore = aliases.size;
        aliases.add(node.name.text);
        changed = aliases.size !== sizeBefore || changed;
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return aliases;
};

const isModuleLoadFrom = (
  node: ts.Expression,
  packageName: string,
  requireAliases: Set<string>,
  createRequireFactories: CreateRequireFactories,
): boolean => {
  const expression = unwrap(node);
  const specifier =
    ts.isCallExpression(expression) && staticMemberName(expression.arguments[0]);
  return (
    ts.isCallExpression(expression) &&
    (isRequireLoader(expression.expression, requireAliases) ||
      isCreatedRequireLoader(expression.expression, createRequireFactories) ||
      expression.expression.kind === ts.SyntaxKind.ImportKeyword) &&
    typeof specifier === 'string' &&
    isPackageSpecifier(specifier, packageName)
  );
};

const isConnectionProperty = (name: ts.PropertyName): boolean => {
  if (
    (ts.isIdentifier(name) || ts.isStringLiteral(name)) &&
    name.text === 'connection'
  ) {
    return true;
  }
  if (!ts.isComputedPropertyName(name)) return false;
  return staticMemberName(name.expression) === 'connection';
};

const ioredisConstructorSites = (
  source: ts.SourceFile,
  file: string,
): string[] => {
  const taintedNames = new Set<string>();
  const taintedThisProperties = new Set<string>();
  const requireAliases = requireLoaderAliases(source);
  const createRequireFactories = createRequireFactoryAliases(source);

  const visitImports = (node: ts.Node) => {
    if (
      ts.isImportEqualsDeclaration(node) &&
      !node.isTypeOnly &&
      ts.isExternalModuleReference(node.moduleReference) &&
      ts.isStringLiteral(node.moduleReference.expression) &&
      isPackageSpecifier(node.moduleReference.expression.text, 'ioredis')
    ) {
      taintedNames.add(node.name.text);
    }
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      isPackageSpecifier(node.moduleSpecifier.text, 'ioredis') &&
      !node.importClause?.isTypeOnly
    ) {
      if (node.importClause.name) taintedNames.add(node.importClause.name.text);
      const bindings = node.importClause.namedBindings;
      if (bindings && ts.isNamespaceImport(bindings)) {
        taintedNames.add(bindings.name.text);
      } else if (bindings && ts.isNamedImports(bindings)) {
        for (const element of bindings.elements) taintedNames.add(element.name.text);
      }
    }
    ts.forEachChild(node, visitImports);
  };
  visitImports(source);

  const isTainted = (node: ts.Expression): boolean => {
    const expression = unwrap(node);
    if (
      isModuleLoadFrom(expression, 'ioredis', requireAliases, createRequireFactories)
    ) {
      return true;
    }
    if (ts.isIdentifier(expression)) return taintedNames.has(expression.text);
    if (ts.isPropertyAccessExpression(expression)) {
      if (
        expression.expression.kind === ts.SyntaxKind.ThisKeyword &&
        taintedThisProperties.has(expression.name.text)
      ) {
        return true;
      }
      return isTainted(expression.expression);
    }
    return false;
  };

  const markTarget = (target: ts.Node): boolean => {
    if (ts.isIdentifier(target)) {
      const sizeBefore = taintedNames.size;
      taintedNames.add(target.text);
      return taintedNames.size !== sizeBefore;
    }
    if (
      ts.isPropertyAccessExpression(target) &&
      target.expression.kind === ts.SyntaxKind.ThisKeyword
    ) {
      const sizeBefore = taintedThisProperties.size;
      taintedThisProperties.add(target.name.text);
      return taintedThisProperties.size !== sizeBefore;
    }
    return false;
  };

  // Follow local aliases and class fields, e.g. `const R = Redis` and
  // `const clientCtor = this.RedisCtor`, until no new alias is discovered.
  let changed = true;
  while (changed) {
    changed = false;
    const visitAliases = (node: ts.Node) => {
      if (
        ts.isVariableDeclaration(node) &&
        node.initializer &&
        isTainted(node.initializer)
      ) {
        for (const name of bindingNames(node.name)) {
          changed = markTarget(ts.factory.createIdentifier(name)) || changed;
        }
      }
      if (
        ts.isParameter(node) &&
        node.initializer &&
        isTainted(node.initializer) &&
        ts.isIdentifier(node.name)
      ) {
        changed = markTarget(node.name) || changed;
      }
      if (
        ts.isPropertyDeclaration(node) &&
        node.initializer &&
        isTainted(node.initializer) &&
        ts.isIdentifier(node.name)
      ) {
        changed = markTarget(ts.factory.createPropertyAccessExpression(
          ts.factory.createThis(),
          node.name,
        )) || changed;
      }
      if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        isTainted(node.right)
      ) {
        changed = markTarget(node.left) || changed;
      }
      ts.forEachChild(node, visitAliases);
    };
    visitAliases(source);
  }

  const sites: string[] = [];
  const visitConstructors = (node: ts.Node) => {
    if (ts.isNewExpression(node) && isTainted(node.expression)) {
      sites.push(`${file}:${node.expression.getText(source)}`);
    }
    ts.forEachChild(node, visitConstructors);
  };
  visitConstructors(source);
  return sites;
};

const importedLocals = (source: ts.SourceFile, packageName: string, importedName: string) => {
  const namedLocals = new Set<string>();
  const namespaces = new Set<string>();
  const requireAliases = requireLoaderAliases(source);
  const createRequireFactories = createRequireFactoryAliases(source);
  for (const statement of source.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      !isPackageSpecifier(statement.moduleSpecifier.text, packageName) ||
      !statement.importClause?.namedBindings
    ) {
      continue;
    }
    const bindings = statement.importClause.namedBindings;
    if (ts.isNamespaceImport(bindings)) namespaces.add(bindings.name.text);
    if (ts.isNamedImports(bindings)) {
      for (const element of bindings.elements) {
        if ((element.propertyName ?? element.name).text === importedName) {
          namedLocals.add(element.name.text);
        }
      }
    }
  }

  const isPackageMember = (node: ts.Expression): boolean => {
    const expression = unwrap(node);
    return (
      ts.isPropertyAccessExpression(expression) &&
      expression.name.text === importedName &&
      isModuleLoadFrom(
        expression.expression,
        packageName,
        requireAliases,
        createRequireFactories,
      )
    );
  };
  let changed = true;
  while (changed) {
    changed = false;
    const visitAliases = (node: ts.Node) => {
      if (ts.isVariableDeclaration(node) && node.initializer) {
        const initializer = unwrap(node.initializer);
        if (
          isModuleLoadFrom(initializer, packageName, requireAliases, createRequireFactories) &&
          ts.isIdentifier(node.name)
        ) {
          const sizeBefore = namespaces.size;
          namespaces.add(node.name.text);
          changed = namespaces.size !== sizeBefore || changed;
        } else if (
          isModuleLoadFrom(initializer, packageName, requireAliases, createRequireFactories) &&
          !ts.isIdentifier(node.name)
        ) {
          for (const element of node.name.elements) {
            if (
              !ts.isOmittedExpression(element) &&
              (element.propertyName ?? element.name).getText(source) === importedName &&
              ts.isIdentifier(element.name)
            ) {
              const sizeBefore = namedLocals.size;
              namedLocals.add(element.name.text);
              changed = namedLocals.size !== sizeBefore || changed;
            }
          }
        } else if (
          !ts.isIdentifier(node.name) &&
          ts.isIdentifier(initializer) &&
          namespaces.has(initializer.text)
        ) {
          for (const element of node.name.elements) {
            if (
              !ts.isOmittedExpression(element) &&
              (element.propertyName ?? element.name).getText(source) === importedName &&
              ts.isIdentifier(element.name)
            ) {
              const sizeBefore = namedLocals.size;
              namedLocals.add(element.name.text);
              changed = namedLocals.size !== sizeBefore || changed;
            }
          }
        } else if (
          ts.isIdentifier(node.name) &&
          ts.isIdentifier(initializer) &&
          namespaces.has(initializer.text)
        ) {
          const sizeBefore = namespaces.size;
          namespaces.add(node.name.text);
          changed = namespaces.size !== sizeBefore || changed;
        } else if (
          ts.isIdentifier(node.name) &&
          ((ts.isIdentifier(initializer) && namedLocals.has(initializer.text)) ||
            isPackageMember(initializer) ||
            (ts.isPropertyAccessExpression(initializer) &&
              ts.isIdentifier(initializer.expression) &&
              namespaces.has(initializer.expression.text) &&
              initializer.name.text === importedName))
        ) {
          const sizeBefore = namedLocals.size;
          namedLocals.add(node.name.text);
          changed = namedLocals.size !== sizeBefore || changed;
        }
      }
      ts.forEachChild(node, visitAliases);
    };
    visitAliases(source);
  }
  return { namedLocals, namespaces };
};

const isImportedName = (
  expression: ts.Expression,
  importedLocalsForName: ReturnType<typeof importedLocals>,
  originalName: string,
): boolean => {
  const node = unwrap(expression);
  return (
    (ts.isIdentifier(node) && importedLocalsForName.namedLocals.has(node.text)) ||
    (ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      importedLocalsForName.namespaces.has(node.expression.text) &&
      node.name.text === originalName)
  );
};

const bullModuleMethods = ['forRoot', 'forRootAsync', 'registerQueue', 'registerQueueAsync'];

const bullModuleMethodAliases = (
  source: ts.SourceFile,
  bullModule: ReturnType<typeof importedLocals>,
  method: string,
): Set<string> => {
  const aliases = new Set<string>();
  const refersToMethod = (expression: ts.Expression): boolean => {
    const node = unwrap(expression);
    if (
      ts.isPropertyAccessExpression(node) &&
      node.name.text === method &&
      isImportedName(node.expression, bullModule, 'BullModule')
    ) {
      return true;
    }
    if (
      ts.isElementAccessExpression(node) &&
      isImportedName(node.expression, bullModule, 'BullModule')
    ) {
      const key = staticMemberName(node.argumentExpression);
      return key === undefined || key === method;
    }
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'bind'
    ) {
      return refersToMethod(node.expression.expression);
    }
    return ts.isIdentifier(node) && aliases.has(node.text);
  };

  let changed = true;
  while (changed) {
    changed = false;
    const visit = (node: ts.Node) => {
      if (
        ts.isVariableDeclaration(node) &&
        node.initializer
      ) {
        if (ts.isIdentifier(node.name) && refersToMethod(node.initializer)) {
          const sizeBefore = aliases.size;
          aliases.add(node.name.text);
          changed = aliases.size !== sizeBefore || changed;
        } else if (
          ts.isObjectBindingPattern(node.name) &&
          isImportedName(unwrap(node.initializer), bullModule, 'BullModule')
        ) {
          for (const element of node.name.elements) {
            const propertyName = element.propertyName ?? element.name;
            if (ts.isIdentifier(propertyName) && propertyName.text === method && ts.isIdentifier(element.name)) {
              const sizeBefore = aliases.size;
              aliases.add(element.name.text);
              changed = aliases.size !== sizeBefore || changed;
            }
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return aliases;
};

const bullModuleMethodAliasSets = (
  source: ts.SourceFile,
  bullModule: ReturnType<typeof importedLocals>,
): Map<string, Set<string>> =>
  new Map(
    bullModuleMethods.map((method) => [
      method,
      bullModuleMethodAliases(source, bullModule, method),
    ]),
  );

const bullModuleMethodForCall = (
  expression: ts.Expression,
  bullModule: ReturnType<typeof importedLocals>,
  aliases: Map<string, Set<string>>,
): string | undefined => {
  const call = unwrap(expression);
  if (ts.isElementAccessExpression(call) && isImportedName(call.expression, bullModule, 'BullModule')) {
    return staticMemberName(call.argumentExpression) ?? 'computed-bull-module-method';
  }
  if (ts.isPropertyAccessExpression(call)) {
    if (isImportedName(call.expression, bullModule, 'BullModule')) return call.name.text;
    if (call.name.text === 'call' || call.name.text === 'apply') {
      const target = unwrap(call.expression);
      if (ts.isPropertyAccessExpression(target) && isImportedName(target.expression, bullModule, 'BullModule')) {
        return target.name.text;
      }
      if (ts.isIdentifier(target)) {
        return [...aliases].find(([, names]) => names.has(target.text))?.[0];
      }
    }
    if (call.name.text === 'bind' && ts.isPropertyAccessExpression(call.expression)) {
      const boundMethod = call.expression;
      if (isImportedName(boundMethod.expression, bullModule, 'BullModule')) {
        return boundMethod.name.text;
      }
    }
  }
  if (ts.isCallExpression(call) && ts.isCallExpression(call.expression)) {
    const bindCall = call.expression;
    const boundMethod =
      ts.isPropertyAccessExpression(bindCall.expression) &&
      bindCall.expression.name.text === 'bind'
        ? bindCall.expression.expression
        : undefined;
    if (
      ts.isPropertyAccessExpression(boundMethod) &&
      isImportedName(boundMethod.expression, bullModule, 'BullModule')
    ) {
      return boundMethod.name.text;
    }
  }
  if (ts.isIdentifier(call)) {
    return [...aliases].find(([, names]) => names.has(call.text))?.[0];
  }
  return undefined;
};

const bullMqDirectConstructors = (sourceFiles = sources): string[] =>
  sourceFiles.flatMap(({ file, source }) => {
    const queueClasses = [
      'Queue',
      'Worker',
      'QueueEvents',
      'FlowProducer',
      'RedisConnection',
      'QueueEventsProducer',
    ];
    const imports = queueClasses.map((name) => importedLocals(source, 'bullmq', name));
    const sites: string[] = [];
    const visit = (node: ts.Node) => {
      if (ts.isNewExpression(node)) {
        for (let index = 0; index < queueClasses.length; index++) {
          if (isImportedName(node.expression, imports[index], queueClasses[index])) {
            sites.push(`${file}:new ${queueClasses[index]}`);
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    return sites;
  }).sort();

const bullModuleSites = (): { roots: string[]; registrations: string[] } => {
  const roots: string[] = [];
  const registrations: string[] = [];
  for (const { file, source } of sources) {
    const bullModule = importedLocals(source, '@nestjs/bullmq', 'BullModule');
    const methodAliases = bullModuleMethodAliasSets(source, bullModule);
    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node)) {
        const method = bullModuleMethodForCall(node.expression, bullModule, methodAliases);
        if (method === 'forRoot' || method === 'forRootAsync') {
          const options = node.arguments[0];
          const usesSharedFactory =
            options &&
            ts.isCallExpression(options) &&
            ts.isIdentifier(options.expression) &&
            options.expression.text === 'createBullOptions';
          roots.push(`${file}:${method}:${usesSharedFactory ? 'createBullOptions' : 'inline-options'}`);
        }
        if (method === 'registerQueue' || method === 'registerQueueAsync') {
          registrations.push(`${file}:${method}`);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return { roots: roots.sort(), registrations: registrations.sort() };
};

const bullMqProcessors = (): string[] =>
  sources.flatMap(({ file, source }) => {
    const processor = importedLocals(source, '@nestjs/bullmq', 'Processor');
    const sites: string[] = [];
    const visit = (node: ts.Node) => {
      if (
        ts.isDecorator(node) &&
        ts.isCallExpression(node.expression) &&
        isImportedName(node.expression.expression, processor, 'Processor')
      ) {
        sites.push(`${file}:@Processor`);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    return sites;
  }).sort();

const optionObjectIsSafe = (expression: ts.Expression | undefined): boolean => {
  if (!expression) return true;
  const options = unwrap(expression);
  if (
    ts.isCallExpression(options) &&
    ts.isIdentifier(options.expression) &&
    options.expression.text === 'createBullOptions'
  ) {
    return true;
  }
  if (!ts.isObjectLiteralExpression(options)) return false;
  for (const property of options.properties) {
    if (ts.isSpreadAssignment(property) || ts.isShorthandPropertyAssignment(property)) {
      return false;
    }
    if (!ts.isPropertyAssignment(property)) return false;
    if (ts.isComputedPropertyName(property.name)) return false;
    if (isConnectionProperty(property.name)) {
      const connection = unwrap(property.initializer);
      if (!ts.isObjectLiteralExpression(connection)) return false;
      if (
        connection.properties.some(
          (entry) =>
            !ts.isPropertyAssignment(entry) || ts.isComputedPropertyName(entry.name),
        )
      ) {
        return false;
      }
      const protocols = connection.properties.filter(
        (entry): entry is ts.PropertyAssignment =>
          ts.isPropertyAssignment(entry) &&
          (ts.isIdentifier(entry.name) || ts.isStringLiteral(entry.name)) &&
          entry.name.text === 'protocol',
      );
      if (protocols.length !== 1) return false;
      const protocol = unwrap(protocols[0].initializer);
      if (!ts.isNumericLiteral(protocol) || protocol.text !== '2') return false;
    }
  }
  return true;
};

const unsafeBullMqOptionSites = (sourceFiles = sources): string[] =>
  sourceFiles.flatMap(({ file, source }) => {
    const bullModule = importedLocals(source, '@nestjs/bullmq', 'BullModule');
    const methodAliases = bullModuleMethodAliasSets(source, bullModule);
    const processor = importedLocals(source, '@nestjs/bullmq', 'Processor');
    const sites: string[] = [];
    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node)) {
        const method = bullModuleMethodForCall(node.expression, bullModule, methodAliases);
        if (method) {
          if (method === 'computed-bull-module-method') {
            sites.push(`${file}:computed BullModule method requires an explicit inventory test`);
          } else if (method === 'forRoot' || method === 'forRootAsync') {
            const options = node.arguments[0];
            const safe =
              options &&
              ts.isCallExpression(options) &&
              ts.isIdentifier(options.expression) &&
              options.expression.text === 'createBullOptions';
            if (!safe) sites.push(`${file}:${method}:options must call createBullOptions()`);
          } else if (method === 'registerQueue') {
            if (node.arguments.some((argument) => !optionObjectIsSafe(argument))) {
              sites.push(`${file}:registerQueue:options must be an inline object without spreads`);
            }
          } else if (method === 'registerQueueAsync') {
            sites.push(`${file}:registerQueueAsync:requires an explicit inventory test`);
          }
        }
        if (isImportedName(node.expression, processor, 'Processor')) {
          const decoratorOptions = node.arguments[0];
          const workerOptions = node.arguments[1];
          if (
            (decoratorOptions &&
              !ts.isStringLiteral(decoratorOptions) &&
              !ts.isNoSubstitutionTemplateLiteral(decoratorOptions) &&
              !optionObjectIsSafe(decoratorOptions)) ||
            !optionObjectIsSafe(workerOptions)
          ) {
            sites.push(`${file}:@Processor:options must be inline and pinned`);
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    return sites;
  }).sort();

const connectionOptionSites = (): string[] =>
  sources.flatMap(({ file, source }) => {
    const sites: string[] = [];
    const visit = (node: ts.Node) => {
      if (
        (ts.isPropertyAssignment(node) || ts.isShorthandPropertyAssignment(node)) &&
        isConnectionProperty(node.name)
      ) {
        sites.push(`${file}:connection`);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    return sites;
  }).sort();

const ioredisSites = (): string[] =>
  sources.flatMap(({ file, source }) => ioredisConstructorSites(source, file)).sort();

type IoredisDuplicateSite =
  | { file: string; kind: 'call'; argumentCount: number }
  | { file: string; kind: 'reference' };

const ioredisDuplicateSites = (
  sourceFiles = sources,
): IoredisDuplicateSite[] =>
  sourceFiles.flatMap(({ file, source }) => {
    const sites: IoredisDuplicateSite[] = [];
    const isDuplicateMember = (
      node: ts.Node,
    ): node is ts.PropertyAccessExpression | ts.ElementAccessExpression =>
      (ts.isPropertyAccessExpression(node) && node.name.text === 'duplicate') ||
      (ts.isElementAccessExpression(node) &&
        staticMemberName(node.argumentExpression) === 'duplicate');

    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node) && isDuplicateMember(node.expression)) {
        sites.push({ file, kind: 'call', argumentCount: node.arguments.length });
      } else if (
        isDuplicateMember(node) &&
        !(ts.isCallExpression(node.parent) && node.parent.expression === node)
      ) {
        sites.push({ file, kind: 'reference' });
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    return sites;
  }).sort((left, right) => left.file.localeCompare(right.file));

const computedMemberCallSites = (sourceFiles = sources): string[] =>
  sourceFiles.flatMap(({ file, source }) => {
    const sites: string[] = [];
    const visit = (node: ts.Node) => {
      if (
        ts.isCallExpression(node) &&
        ts.isElementAccessExpression(node.expression) &&
        staticMemberName(node.expression.argumentExpression) === undefined
      ) {
        sites.push(`${file}:${node.expression.getText(source)}`);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    return sites;
  }).sort();

const nonLiteralModuleLoadSites = (sourceFiles = sources): string[] =>
  sourceFiles.flatMap(({ file, source }) => {
    const requireAliases = requireLoaderAliases(source);
    const createRequireFactories = createRequireFactoryAliases(source);
    const sites: string[] = [];
    const visit = (node: ts.Node) => {
      if (
        ts.isCallExpression(node) &&
        (isRequireLoader(node.expression, requireAliases) ||
          isCreatedRequireLoader(node.expression, createRequireFactories) ||
          node.expression.kind === ts.SyntaxKind.ImportKeyword) &&
        staticMemberName(node.arguments[0]) === undefined
      ) {
        const loader =
          isRequireLoader(node.expression, requireAliases) ||
          isCreatedRequireLoader(node.expression, createRequireFactories)
          ? `${node.expression.getText(source)}()`
          : 'import()';
        sites.push(`${file}:${loader}`);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    return sites;
  }).sort();

const requireBindSitesWithBoundArguments = (sourceFiles = sources): string[] =>
  sourceFiles.flatMap(({ file, source }) => {
    const requireAliases = requireLoaderAliases(source);
    const sites: string[] = [];
    const visit = (node: ts.Node) => {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === 'bind' &&
        isRequireLoader(node.expression.expression, requireAliases) &&
        node.arguments.length > 1
      ) {
        sites.push(`${file}:${node.expression.expression.getText(source)}.bind`);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    return sites;
  }).sort();

const functionConstructorSites = (sourceFiles = sources): string[] =>
  sourceFiles.flatMap(({ file, source }) => {
    const sites: string[] = [];
    const visit = (node: ts.Node) => {
      if (ts.isNewExpression(node)) {
        const constructor = unwrap(node.expression);
        if (ts.isIdentifier(constructor) && constructor.text === 'Function') {
          let parent: ts.Node | undefined = node.parent;
          while (parent && !ts.isVariableDeclaration(parent)) parent = parent.parent;
          const declaration = parent && ts.isVariableDeclaration(parent) ? parent : undefined;
          const declaredName =
            declaration && ts.isIdentifier(declaration.name)
              ? declaration.name.text
              : 'new Function';
          sites.push(`${file}:${declaredName}`);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    return sites;
  }).sort();

const functionLoaderReferenceSites = (sourceFiles = sources): string[] =>
  sourceFiles.flatMap(({ file, source }) => {
    const loaderNames = new Set<string>();
    const findLoaders = (node: ts.Node) => {
      if (ts.isNewExpression(node)) {
        const constructor = unwrap(node.expression);
        if (ts.isIdentifier(constructor) && constructor.text === 'Function') {
          let parent: ts.Node | undefined = node.parent;
          while (parent && !ts.isVariableDeclaration(parent)) parent = parent.parent;
          const declaration = parent && ts.isVariableDeclaration(parent) ? parent : undefined;
          if (declaration && ts.isIdentifier(declaration.name)) {
            loaderNames.add(declaration.name.text);
          }
        }
      }
      ts.forEachChild(node, findLoaders);
    };
    findLoaders(source);

    const sites: string[] = [];
    const visitReferences = (node: ts.Node) => {
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        loaderNames.has(node.expression.text)
      ) {
        sites.push(`${file}:${node.getText(source)}`);
      } else if (
        ts.isIdentifier(node) &&
        loaderNames.has(node.text) &&
        !(ts.isVariableDeclaration(node.parent) && node.parent.name === node) &&
        !(ts.isCallExpression(node.parent) && node.parent.expression === node)
      ) {
        sites.push(`${file}:${node.text}`);
      }
      ts.forEachChild(node, visitReferences);
    };
    visitReferences(source);
    return sites;
  }).sort();

const runtimeModuleSites = (packageName: string, sourceFiles = sources): string[] =>
  sourceFiles.flatMap(({ file, source }) => {
    const requireAliases = requireLoaderAliases(source);
    const createRequireFactories = createRequireFactoryAliases(source);
    const sites: string[] = [];
    const visit = (node: ts.Node) => {
      const runtimePackageImport =
        (ts.isImportDeclaration(node) &&
          !node.importClause?.isTypeOnly &&
          ts.isStringLiteral(node.moduleSpecifier) &&
          isPackageSpecifier(node.moduleSpecifier.text, packageName)) ||
        (ts.isExportDeclaration(node) &&
          !node.isTypeOnly &&
          node.moduleSpecifier &&
          ts.isStringLiteral(node.moduleSpecifier) &&
          isPackageSpecifier(node.moduleSpecifier.text, packageName)) ||
        (ts.isImportEqualsDeclaration(node) &&
          !node.isTypeOnly &&
          ts.isExternalModuleReference(node.moduleReference) &&
          ts.isStringLiteral(node.moduleReference.expression) &&
          isPackageSpecifier(node.moduleReference.expression.text, packageName));
      if (runtimePackageImport) {
        sites.push(file);
      }
      if (
        ts.isCallExpression(node) &&
        isModuleLoadFrom(node, packageName, requireAliases, createRequireFactories)
      ) {
        sites.push(file);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    return sites;
  }).sort();

const ioredisRuntimeModuleSites = (sourceFiles = sources): string[] =>
  runtimeModuleSites('ioredis', sourceFiles);

const nestBullMqRuntimeModuleSites = (sourceFiles = sources): string[] =>
  runtimeModuleSites('@nestjs/bullmq', sourceFiles);

describe('Redis connection inventory', () => {
  it('enumerates ioredis constructions, including aliases and require()', () => {
    expect(ioredisSites()).toEqual([
      'app.service.ts:Redis',
      'modules/backup/backup.service.ts:this.RedisCtor',
      'modules/monitoring/redis-memory-sampler.service.ts:Redis',
    ]);
  });

  it('requires explicit review of any production duplicate() member reference', () => {
    expect(ioredisDuplicateSites()).toEqual([]);
  });

  it('does not pass override arguments to ioredis duplicate()', () => {
    expect(
      ioredisDuplicateSites().filter(
        (site) => site.kind === 'call' && site.argumentCount > 0,
      ),
    ).toEqual([]);
  });

  it('finds ioredis duplicate calls with override options through type assertions', () => {
    const source = ts.createSourceFile(
      'fixture.ts',
      'class Service { redis: any; duplicate() { (this.redis as any).duplicate({ protocol: 3 }); } }',
      ts.ScriptTarget.Latest,
      true,
    );
    expect(ioredisDuplicateSites([{ file: 'fixture.ts', source }])).toEqual([
      { file: 'fixture.ts', kind: 'call', argumentCount: 1 },
    ]);
  });

  it('finds aliased ioredis duplicate member references', () => {
    const source = ts.createSourceFile(
      'fixture.ts',
      'class Service { redis: any; duplicate() { const makeDuplicate = this.redis.duplicate.bind(this.redis); makeDuplicate({ protocol: 3 }); } }',
      ts.ScriptTarget.Latest,
      true,
    );
    expect(ioredisDuplicateSites([{ file: 'fixture.ts', source }])).toEqual([
      { file: 'fixture.ts', kind: 'reference' },
    ]);
  });

  it('finds computed ioredis duplicate member calls', () => {
    const source = ts.createSourceFile(
      'fixture.ts',
      "class Service { redis: any; duplicate() { this.redis['dupli' + 'cate']({ protocol: 3 }); } }",
      ts.ScriptTarget.Latest,
      true,
    );
    expect(computedMemberCallSites([{ file: 'fixture.ts', source }])).toEqual([
      "fixture.ts:this.redis['dupli' + 'cate']",
    ]);
  });

  it('enumerates production computed member calls that require review', () => {
    expect(computedMemberCallSites()).toEqual([
      'modules/bank-reconciliations/services/bank-reconciliation-lifecycle.service.ts:(this.reconciliationService as any)[RECONCILIATION_TEST_HOOK]',
      'modules/bank-reconciliations/services/bank-reconciliation-lifecycle.service.ts:(this.reconciliationService as any)[RECONCILIATION_TEST_HOOK]',
      'modules/bank-reconciliations/services/bank-reconciliation-lifecycle.service.ts:(this.reconciliationService as any)[RECONCILIATION_TEST_HOOK]',
      'modules/bank-reconciliations/services/bank-reconciliation.service.ts:(this as any)[RECONCILIATION_TEST_HOOK]',
      'modules/bank-reconciliations/services/bank-reconciliation.service.ts:(this as any)[RECONCILIATION_TEST_HOOK]',
    ]);
  });

  it('enumerates runtime imports and re-exports that could introduce ioredis clients', () => {
    expect(ioredisRuntimeModuleSites()).toEqual([
      'app.service.ts',
      'modules/backup/backup.service.ts',
      'modules/monitoring/redis-memory-sampler.service.ts',
    ]);
  });

  it.each([
    "import { Module } from 'node:module'; const Redis = Module.createRequire(import.meta.url)('ioredis'); new Redis({ protocol: 3 });",
    "import { Module as NodeModule } from 'node:module'; const Redis = NodeModule.createRequire(import.meta.url)('ioredis'); new Redis({ protocol: 3 });",
    "import { default as NodeModule } from 'node:module'; const Redis = NodeModule.createRequire(import.meta.url)('ioredis'); new Redis({ protocol: 3 });",
    "const { Module } = await import('node:module'); const Redis = Module.createRequire(import.meta.url)('ioredis'); new Redis({ protocol: 3 });",
    "const { default: NodeModule } = await import('node:module'); const Redis = NodeModule.createRequire(import.meta.url)('ioredis'); new Redis({ protocol: 3 });",
  ])('finds ioredis constructors through node:module namespace aliases %s', (fixture) => {
    const source = ts.createSourceFile('fixture.ts', fixture, ts.ScriptTarget.Latest, true);
    expect(ioredisConstructorSites(source, 'fixture.ts')).toEqual(['fixture.ts:Redis']);
  });

  it.each([
    "const load = require; const Redis = load('ioredis'); new Redis({ protocol: 3 });",
    "const load = module.require; const Redis = load('ioredis'); new Redis({ protocol: 3 });",
    "const Redis = module.require('ioredis'); new Redis({ protocol: 3 });",
    "import { createRequire as makeRequire } from 'node:module'; const load = makeRequire(__filename); const Redis = load('ioredis'); new Redis({ protocol: 3 });",
    "import * as Module from 'node:module'; const load = Module.createRequire(__filename); const Redis = load('ioredis'); new Redis({ protocol: 3 });",
    "import { createRequire } from 'node:module'; const Redis = createRequire(__filename)('ioredis'); new Redis({ protocol: 3 });",
    "const { createRequire } = require('node:module'); const Redis = createRequire(__filename)('ioredis'); new Redis({ protocol: 3 });",
    "const Redis = require('node:module').createRequire(__filename)('ioredis'); new Redis({ protocol: 3 });",
    "const load = require; const { createRequire } = load('node:module'); const Redis = createRequire(__filename)('ioredis'); new Redis({ protocol: 3 });",
    "const load = require; const Redis = load('node:module').createRequire(__filename)('ioredis'); new Redis({ protocol: 3 });",
    "import Module from 'node:module'; const Redis = Module.createRequire(import.meta.url)('ioredis'); new Redis({ protocol: 3 });",
    "import RedisModule = require('ioredis'); new RedisModule.default({ protocol: 3 });",
    "import Module = require('node:module'); const Redis = Module.createRequire(__filename)('ioredis'); new Redis({ protocol: 3 });",
    "const { createRequire } = await import('node:module'); const Redis = createRequire(__filename)('ioredis'); new Redis({ protocol: 3 });",
    "const Module = await import('node:module'); const Redis = Module.createRequire(__filename)('ioredis'); new Redis({ protocol: 3 });",
  ])('detects ioredis clients loaded with %s', (fixture) => {
    const source = ts.createSourceFile('fixture.ts', fixture, ts.ScriptTarget.Latest, true);
    const sourceFiles = [{ file: 'fixture.ts', source }];
    expect(ioredisRuntimeModuleSites(sourceFiles)).toEqual(['fixture.ts']);
    expect(ioredisConstructorSites(source, 'fixture.ts')).toEqual([
      fixture.includes('RedisModule =')
        ? 'fixture.ts:RedisModule.default'
        : 'fixture.ts:Redis',
    ]);
  });

  it('enumerates runtime BullMQ loads through require aliases', () => {
    expect(runtimeModuleSites('bullmq')).toEqual([]);
  });

  it('detects BullMQ loaded through a TypeScript import-equals declaration', () => {
    const source = ts.createSourceFile(
      'fixture.ts',
      "import BullMQ = require('bullmq'); new BullMQ.Queue('queue');",
      ts.ScriptTarget.Latest,
      true,
    );
    expect(runtimeModuleSites('bullmq', [{ file: 'fixture.ts', source }])).toEqual([
      'fixture.ts',
    ]);
  });

  it('enumerates nonliteral require and dynamic import arguments', () => {
    expect(nonLiteralModuleLoadSites()).toEqual([]);
  });

  it('finds nonliteral require and dynamic import arguments', () => {
    const source = ts.createSourceFile(
      'fixture.ts',
      "const load = require; load(packageName); import('io' + 'redis');",
      ts.ScriptTarget.Latest,
      true,
    );
    expect(nonLiteralModuleLoadSites([{ file: 'fixture.ts', source }])).toEqual([
      'fixture.ts:import()',
      'fixture.ts:load()',
    ]);
  });

  it('finds nonliteral module.require calls and their local aliases', () => {
    const source = ts.createSourceFile(
      'fixture.ts',
      'const loadModule = module.require; loadModule(packageName); module.require(otherPackage);',
      ts.ScriptTarget.Latest,
      true,
    );
    expect(nonLiteralModuleLoadSites([{ file: 'fixture.ts', source }])).toEqual([
      'fixture.ts:loadModule()',
      'fixture.ts:module.require()',
    ]);
  });

  it('finds nonliteral arguments passed to a createRequire loader', () => {
    const source = ts.createSourceFile(
      'fixture.ts',
      "import { createRequire } from 'node:module'; const load = createRequire(__filename); load(packageName);",
      ts.ScriptTarget.Latest,
      true,
    );
    expect(nonLiteralModuleLoadSites([{ file: 'fixture.ts', source }])).toEqual([
      'fixture.ts:load()',
    ]);
  });

  it('finds nonliteral arguments passed to an inline createRequire loader', () => {
    const source = ts.createSourceFile(
      'fixture.ts',
      "import { createRequire } from 'node:module'; createRequire(__filename)(packageName);",
      ts.ScriptTarget.Latest,
      true,
    );
    expect(nonLiteralModuleLoadSites([{ file: 'fixture.ts', source }])).toEqual([
      'fixture.ts:createRequire(__filename)()',
    ]);
  });

  it('enumerates require loaders that bind package arguments ahead of time', () => {
    expect(requireBindSitesWithBoundArguments()).toEqual([]);
  });

  it.each([
    "const load = require.bind(null, 'ioredis'); const Redis = load(); new Redis({});",
    "const load = module.require.bind(module, 'ioredis'); const Redis = load(); new Redis({});",
  ])('finds a package bound into a require loader: %s', (fixture) => {
    const source = ts.createSourceFile('fixture.ts', fixture, ts.ScriptTarget.Latest, true);
    expect(requireBindSitesWithBoundArguments([{ file: 'fixture.ts', source }])).toEqual([
      fixture.includes('module.require') ? 'fixture.ts:module.require.bind' : 'fixture.ts:require.bind',
    ]);
  });

  it('enumerates dynamic Function loaders and their approved arguments', () => {
    expect(functionConstructorSites()).toEqual([
      'modules/backup/backup.service.ts:importArchiver',
    ]);
    expect(functionLoaderReferenceSites()).toEqual([
      "modules/backup/backup.service.ts:importArchiver('archiver')",
    ]);
  });

  it('finds dynamic Function loaders and tracks every loader reference', () => {
    const source = ts.createSourceFile(
      'fixture.ts',
      "const loadModule = new Function('specifier', 'return import(specifier)'); loadModule('ioredis');",
      ts.ScriptTarget.Latest,
      true,
    );
    expect(functionConstructorSites([{ file: 'fixture.ts', source }])).toEqual([
      'fixture.ts:loadModule',
    ]);
    expect(functionLoaderReferenceSites([{ file: 'fixture.ts', source }])).toEqual([
      "fixture.ts:loadModule('ioredis')",
    ]);
  });

  it('detects a new ioredis re-export barrel', () => {
    const source = ts.createSourceFile(
      'fixture.ts',
      "export { default as Redis } from 'ioredis';",
      ts.ScriptTarget.Latest,
      true,
    );
    expect(ioredisRuntimeModuleSites([{ file: 'fixture.ts', source }])).toEqual([
      'fixture.ts',
    ]);
  });

  it('detects a deep ioredis import that can construct a client', () => {
    const source = ts.createSourceFile(
      'fixture.ts',
      "import Redis from 'ioredis/built/Redis'; new Redis({ protocol: 3 });",
      ts.ScriptTarget.Latest,
      true,
    );
    const sourceFiles = [{ file: 'fixture.ts', source }];
    expect(ioredisRuntimeModuleSites(sourceFiles)).toEqual(['fixture.ts']);
    expect(ioredisConstructorSites(source, 'fixture.ts')).toEqual(['fixture.ts:Redis']);
  });

  it('enumerates runtime Nest BullMQ imports so re-export barrels require review', () => {
    expect(nestBullMqRuntimeModuleSites()).toEqual([
      'app.module.ts',
      'database/cli/reconcile-schedulers.module.ts',
      'modules/backup/backup-scheduler.service.ts',
      'modules/backup/backup.module.ts',
      'modules/backup/backup.processor.ts',
      'modules/backup/orphaned-scheduler-reconciler.service.ts',
    ]);
  });

  it('detects a new Nest BullMQ re-export barrel', () => {
    const source = ts.createSourceFile(
      'fixture.ts',
      "export { BullModule } from '@nestjs/bullmq';",
      ts.ScriptTarget.Latest,
      true,
    );
    expect(nestBullMqRuntimeModuleSites([{ file: 'fixture.ts', source }])).toEqual([
      'fixture.ts',
    ]);
  });

  it.each([
    ["import Redis from 'ioredis'; new Redis.Cluster([]);", ['Redis.Cluster']],
    ["import Redis from 'ioredis'; const R = Redis; new R({});", ['R']],
    ["const Redis = require('ioredis'); new Redis({});", ['Redis']],
    [
      "async function start() { const { default: Redis } = await import('ioredis'); new Redis({}); }",
      ['Redis'],
    ],
    [
      "import * as IORedis from 'ioredis'; class Client { Ctor = IORedis.default; run() { const k = this.Ctor; return new k({}); } }",
      ['k'],
    ],
    [
      "import Redis from 'ioredis'; function create(Ctor = Redis) { return new Ctor({ protocol: 3 }); }",
      ['Ctor'],
    ],
    [
      "const load = require; const Redis = load('ioredis'); new Redis({ protocol: 3 });",
      ['Redis'],
    ],
    [
      "const load = module.require; const Redis = load('ioredis'); new Redis({ protocol: 3 });",
      ['Redis'],
    ],
    [
      "const load = require.bind(null); const Redis = load('ioredis'); new Redis({ protocol: 3 });",
      ['Redis'],
    ],
    [
      "const load = module.require.bind(module); const Redis = load('ioredis'); new Redis({ protocol: 3 });",
      ['Redis'],
    ],
    ["const Redis = module.require('ioredis'); new Redis({ protocol: 3 });", ['Redis']],
    [
      "import { createRequire as makeRequire } from 'node:module'; const load = makeRequire(__filename); const Redis = load('ioredis'); new Redis({ protocol: 3 });",
      ['Redis'],
    ],
  ])('finds ioredis constructor variant %s', (fixture, expected) => {
    const source = ts.createSourceFile('fixture.ts', fixture, ts.ScriptTarget.Latest, true);
    expect(ioredisConstructorSites(source, 'fixture.ts')).toEqual(
      expected.map((name) => `fixture.ts:${name}`),
    );
  });

  it('enumerates current direct BullMQ queue and worker constructors', () => {
    expect(bullMqDirectConstructors()).toEqual([]);
  });

  it.each([
    "import * as BullMQ from 'bullmq'; const Q = BullMQ.Queue; new Q('queue');",
    "import * as BullMQ from 'bullmq'; const B = BullMQ; const Q = B.Queue; new Q('queue');",
    "import * as BullMQ from 'bullmq'; const { Queue: Q } = BullMQ; new Q('queue');",
    "const { Queue: Q } = await import('bullmq'); new Q('queue');",
    "import { RedisConnection as RedisClient } from 'bullmq'; new RedisClient({} as any);",
    "import { createRequire } from 'node:module'; const load = createRequire(__filename); const Queue = load('bullmq').Queue; new Queue('q');",
  ])('finds direct BullMQ constructor alias %s', (fixture) => {
    const source = ts.createSourceFile(
      'fixture.ts',
      fixture,
      ts.ScriptTarget.Latest,
      true,
    );
    expect(bullMqDirectConstructors([{ file: 'fixture.ts', source }])).toEqual([
      fixture.includes('RedisConnection')
        ? 'fixture.ts:new RedisConnection'
        : 'fixture.ts:new Queue',
    ]);
  });

  it('enumerates BullMQ roots and queue registrations', () => {
    expect(bullModuleSites()).toEqual({
      roots: [
        'app.module.ts:forRootAsync:createBullOptions',
        'database/cli/reconcile-schedulers.module.ts:forRootAsync:createBullOptions',
      ],
      registrations: [
        'database/cli/reconcile-schedulers.module.ts:registerQueue',
        'modules/backup/backup.module.ts:registerQueue',
      ],
    });
  });

  it('enumerates current BullMQ processor decorators', () => {
    expect(bullMqProcessors()).toEqual(['modules/backup/backup.processor.ts:@Processor']);
  });

  it('requires explicit pinned options at every BullMQ connection wiring site', () => {
    expect(unsafeBullMqOptionSites()).toEqual([]);
  });

  it.each([
    `import { BullModule } from '@nestjs/bullmq'; const extraOpts = { connection: { protocol: 3 } }; BullModule.registerQueue({ name: 'q', ...extraOpts });`,
    `import { BullModule } from '@nestjs/bullmq'; const extraOpts = { connection: { protocol: 3 } }; BullModule.registerQueue(extraOpts);`,
    `import { Processor } from '@nestjs/bullmq'; const workerOptions = { connection: { protocol: 3 } }; Processor('q', workerOptions);`,
    `import { Processor } from '@nestjs/bullmq'; Processor('q', { ['conn' + 'ection']: { protocol: 3 } });`,
  ])('rejects indirect or computed BullMQ options: %s', (fixture) => {
    const source = ts.createSourceFile('fixture.ts', fixture, ts.ScriptTarget.Latest, true);
    expect(unsafeBullMqOptionSites([{ file: 'fixture.ts', source }])).toHaveLength(1);
  });

  it.each([
    `import { BullModule } from '@nestjs/bullmq'; const registerQueue = BullModule.registerQueue; const queueOptions = { connection: { protocol: 3 } }; registerQueue(queueOptions);`,
    `import { BullModule } from '@nestjs/bullmq'; const BM = BullModule; const queueOptions = { connection: { protocol: 3 } }; BM.registerQueue(queueOptions);`,
    `import { BullModule } from '@nestjs/bullmq'; const { registerQueue } = BullModule; const queueOptions = { connection: { protocol: 3 } }; registerQueue(queueOptions);`,
    `import { BullModule } from '@nestjs/bullmq'; const BM = BullModule; const { registerQueue: rq } = BM; const queueOptions = { connection: { protocol: 3 } }; rq(queueOptions);`,
    `import { BullModule } from '@nestjs/bullmq'; const queueOptions = { connection: { protocol: 3 } }; BullModule.registerQueue.bind(BullModule)(queueOptions);`,
    `import { BullModule } from '@nestjs/bullmq'; const queueOptions = { connection: { protocol: 3 } }; BullModule['registerQueue'](queueOptions);`,
    `import { BullModule } from '@nestjs/bullmq'; const queueOptions = { connection: { protocol: 3 } }; BullModule.registerQueue.call(BullModule, queueOptions);`,
    `import { BullModule } from '@nestjs/bullmq'; const queueOptions = { connection: { protocol: 3 } }; BullModule.registerQueue.apply(BullModule, [queueOptions]);`,
    `import { Processor } from '@nestjs/bullmq'; const Process = Processor; const workerOptions = { connection: { protocol: 3 } }; Process('q', workerOptions);`,
  ])('rejects aliased BullMQ wiring with indirect options: %s', (fixture) => {
    const source = ts.createSourceFile('fixture.ts', fixture, ts.ScriptTarget.Latest, true);
    expect(unsafeBullMqOptionSites([{ file: 'fixture.ts', source }])).toHaveLength(1);
  });

  it('keeps the shared factory as the only production Redis connection option', () => {
    expect(connectionOptionSites()).toEqual(['config/bull-options.factory.ts:connection']);
  });

  it.each(["['connection']", '[`connection`]'])('recognizes computed connection key %s', (key) => {
    const source = ts.createSourceFile(
      'fixture.ts',
      `const options = { ${key}: { protocol: 3 } };`,
      ts.ScriptTarget.Latest,
      true,
    );
    let foundConnection = false;
    const visit = (node: ts.Node) => {
      if (
        (ts.isPropertyAssignment(node) || ts.isShorthandPropertyAssignment(node)) &&
        isConnectionProperty(node.name)
      ) {
        foundConnection = true;
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    expect(foundConnection).toBe(true);
  });
});
