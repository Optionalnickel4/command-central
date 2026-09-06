import { Suspense } from "react";
import AxiomShell from "@/components/axiom/shell";
import type { Destination } from "@/components/axiom/fixtures";
export default function DashboardShell({ destination = "command" }: { destination?: Destination }) {
 return <Suspense fallback={<main className="ax-loading" role="status">Opening Command Central…</main>}><AxiomShell destination={destination}/></Suspense>;
}
