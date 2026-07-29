import { Button } from "@/components/ui/button";

export default function App() {
  return (
    <main data-admin-app className="min-h-screen bg-background p-6 text-foreground">
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <h1 className="text-2xl font-semibold">Панель управления</h1>
        <p className="text-muted-foreground">
          Административное приложение готово к настройке.
        </p>
        <Button>Продолжить</Button>
      </div>
    </main>
  );
}
