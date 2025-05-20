module.exports = {
  overrides: [
    {
      files: ['lookupAndHistory.js'],
      rules: {
        // Disable the rule that flags private/protected properties in exported classes
        '@typescript-eslint/naming-convention': 'off'
      }
    }
  ]
}; 