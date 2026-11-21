function offlineGitOptions(cwd) {
  return {
    cwd,
    env: { ...process.env, GIT_NO_LAZY_FETCH: '1', GIT_NO_REPLACE_OBJECTS: '1', GIT_ALLOW_PROTOCOL: '' },
  };
}

module.exports = { offlineGitOptions };
