import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
      <p className="text-4xl font-bold text-muted-foreground">404</p>
      <p className="text-muted-foreground text-sm">Página no encontrada</p>
      <Link href="/">
        <Button variant="outline" size="sm">Volver al inicio</Button>
      </Link>
    </div>
  );
}
