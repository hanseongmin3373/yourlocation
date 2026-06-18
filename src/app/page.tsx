import { headers } from "next/headers";
import HomePage from "@/components/HomePage";
import { getPreferredClientIp } from "@/lib/client-ip";

export default async function Page() {
  const headerList = await headers();
  const initialIp = getPreferredClientIp(headerList) ?? "";

  return <HomePage initialIp={initialIp} />;
}
