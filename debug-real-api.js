// Debug script to test with real API data
const http = require('http')

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

// Fetch real data from API
const options = {
  hostname: 'localhost',
  port: 3001,
  path: '/api/inventory/categories/tree',
  method: 'GET'
}

const req = http.request(options, (res) => {
  let data = ''
  
  res.on('data', (chunk) => {
    data += chunk
  })
  
  res.on('end', () => {
    try {
      const response = JSON.parse(data)
      console.log('=== API Response ===')
      console.log('Response structure:', Object.keys(response))
      console.log('Data length:', response.data?.length || 0)
      
      if (response.data) {
        console.log('\n=== Category Tree Structure ===')
        response.data.forEach((cat, i) => {
          console.log(`${i+1}. ${cat.name} (${cat.children?.length || 0} children)`)
        })
        
        console.log('\n=== Testing Flattening Logic ===')
        const flattened = flattenCategoryTree(response.data)
        
        console.log('\n=== Final Flattened Result ===')
        flattened.forEach((cat, index) => {
          console.log(`${index + 1}. ${cat.displayName} (ID: ${cat.id})`)
        })
        
        // Look for "test11" specifically
        const test11Index = flattened.findIndex(cat => cat.name === 'test11')
        if (test11Index >= 0) {
          console.log(`\n=== Found test11 at index ${test11Index} ===`)
          console.log('Items after test11:')
          flattened.slice(test11Index + 1).forEach((cat, i) => {
            console.log(`${test11Index + i + 2}. ${cat.displayName}`)
          })
        }
      }
    } catch (err) {
      console.error('Failed to parse API response:', err.message)
      console.log('Raw response:', data)
    }
  })
})

req.on('error', (err) => {
  console.error('Request error:', err.message)
})

req.end()