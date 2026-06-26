import { isDemoSeedingEnabled } from "@/lib/env";
import { LoginForm } from "./_components/LoginForm";

export default function LoginPage() {
  return <LoginForm showDemoAccounts={isDemoSeedingEnabled()} />;
}
