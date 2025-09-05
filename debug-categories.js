// Debug script to test category flattening logic
const flattenCategoryTree = (categories, level = 0) => {
  const flattened = []
  
  categories.forEach(category => {
    // Create display name with indentation
    const indent = '  '.repeat(level)
    const displayName = `${indent}${category.name}`
    
    flattened.push({
      ...category,
      displayName,
      indentLevel: level
    })
    
    console.log(`Added: ${displayName} (level ${level})`)
    
    // Recursively add children
    if (category.children && category.children.length > 0) {
      console.log(`Processing ${category.children.length} children of ${category.name}`)
      flattened.push(...flattenCategoryTree(category.children, level + 1))
    }
  })
  
  return flattened
}

// Test with mock data similar to API response
const testData = [
  {
    "id": "1",
    "name": "test1",
    "level": 0,
    "children": [
      {
        "id": "2",
        "name": "test1111",
        "level": 1,
        "children": []
      },
      {
        "id": "3", 
        "name": "test12",
        "level": 1,
        "children": [
          {
            "id": "4",
            "name": "test122",
            "level": 2,
            "children": []
          }
        ]
      }
    ]
  },
  {
    "id": "5",
    "name": "test2", 
    "level": 0,
    "children": [
      {
        "id": "6",
        "name": "test11",
        "level": 1,
        "children": [
          {
            "id": "7",
            "name": "test111",
            "level": 2,
            "children": []
          }
        ]
      },
      {
        "id": "8",
        "name": "test21",
        "level": 1, 
        "children": []
      },
      {
        "id": "9",
        "name": "test22",
        "level": 1,
        "children": []
      }
    ]
  },
  {
    "id": "10",
    "name": "test3",
    "level": 0,
    "children": []
  }
]

console.log('=== Testing Category Flattening Logic ===')
const flattened = flattenCategoryTree(testData)
console.log('\n=== Final Result ===')
flattened.forEach((cat, index) => {
  console.log(`${index + 1}. ${cat.displayName}`)
})