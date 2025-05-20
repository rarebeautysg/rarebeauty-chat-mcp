module.exports = {
  extends: 'next/core-web-vitals',
  rules: {
    // Allow unused variables and parameters
    '@typescript-eslint/no-unused-vars': 'off',
    
    // Allow any type for now
    '@typescript-eslint/no-explicit-any': 'off',
    
    // Allow let instead of const for variables that could be const
    'prefer-const': 'off'
  }
}; 