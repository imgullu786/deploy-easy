import { Link, useNavigate } from 'react-router-dom';
import { LogOut, Rocket } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const Navbar = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <nav className="bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 shadow-md">
      <div className="container mx-auto px-6 max-w-7xl">
        <div className="flex justify-between items-center h-16">
          {/* Logo / Brand */}
          <Link
            to="/dashboard"
            className="flex items-center space-x-2 text-2xl font-extrabold text-white hover:scale-105 transition-transform"
          >
            <Rocket className="h-7 w-7 text-yellow-300 drop-shadow-md" />
            <span className="tracking-tight">Deploy Easy</span>
          </Link>

          {/* User + Actions */}
          <div className="flex items-center space-x-6">
            <span className="text-sm font-medium text-white/90">
              Welcome, <span className="font-semibold text-white">{user?.name}</span>
            </span>
            <button
              onClick={handleLogout}
              className="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-white/10 text-white text-sm font-medium hover:bg-white/20 backdrop-blur-md transition-colors shadow-sm"
            >
              <LogOut className="h-4 w-4" />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
