import { useAuth } from "../../contexts/AuthContext";
import logo from '../../assets/agrodronelogo.png';

export function Header() {
  const { logout } = useAuth();

  return (
    <header className="bg-white shadow-sm border-b">
      <div className="flex items-center justify-between px-6">
      <div className="px-6 flex items-center gap-4">
        <img src={logo} alt="Logo" className="h-20 w-auto object-contain" />
        <div className="py-4">
          <h1 className="text-2xl font-bold text-gray-900">AgroDrone Control System</h1>
          <p className="text-gray-600">Semi-autonomous agricultural monitoring</p>
        </div>
      </div>
      <button
          onClick={logout}
          className="text-sm text-gray-600 hover:text-red-600 transition-colors"
        >
          Log out
        </button>
        </div>
    </header>
  );
}
