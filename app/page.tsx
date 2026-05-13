import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { Suspense } from "react"

async function HomeContent() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    redirect("/dashboard")
  } else {
    redirect("/auth/login")
  }
}

export default function Home() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <HomeContent />
    </Suspense>
  )
}