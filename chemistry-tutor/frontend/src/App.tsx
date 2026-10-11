import { useEffect, useState } from 'react'

type HealthResponse = {
  status: string
  app_name: string
  environment: string
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'

function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/v1/health`)
      .then((res) => {
        if (!res.ok) throw new Error(`Request failed: ${res.status}`)
        return res.json()
      })
      .then(setHealth)
      .catch((err) => setError(err.message))
  }, [])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white p-8 rounded-lg shadow-md text-center">
        <h1 className="text-2xl font-semibold mb-4">Chemistry Tutor</h1>
        {error && <p className="text-red-600">Backend error: {error}</p>}
        {!error && !health && <p className="text-gray-500">Checking backend...</p>}
        {health && (
          <div className="text-green-700">
            <p>Status: {health.status}</p>
            <p>{health.app_name}</p>
            <p className="text-sm text-gray-500">{health.environment}</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default App
