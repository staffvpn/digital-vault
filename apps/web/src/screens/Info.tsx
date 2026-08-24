import { Header } from "../components/Header";
import { Card } from "../components/ui";

export function InfoScreen() {
  return (
    <div className="mx-auto min-h-screen max-w-md pb-24">
      <Header title="Info" eyebrow="Личное хранилище" back />
      <main className="space-y-4 px-4 pt-4">
        <Card className="p-4">
          <p className="text-sm leading-relaxed text-slate">
            Здесь будет политика конфиденциальности и условия использования сервиса.
          </p>
        </Card>
      </main>
    </div>
  );
}
