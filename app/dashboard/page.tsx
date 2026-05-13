import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { Suspense } from "react"

async function DashboardContent() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect("/auth/login")
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Dashboard</h1>
      <p className="text-muted-foreground">Welcome, {user.email}</p>
    </div>
  )
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="p-8">Loading...</div>}>
      <DashboardContent />
    </Suspense>
  )
}