import React, { useState, useEffect, useCallback } from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import axios from 'axios';
import './App.css';

// UI Components
import { Button } from './components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card';
import { Badge } from './components/ui/badge';
import { Input } from './components/ui/input';
import { Label } from './components/ui/label';
import { Textarea } from './components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from './components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './components/ui/table';

// Icons
import { AlertTriangle, CheckCircle, MapPin, Users, Clock, BarChart3, Download, Settings, Home, User, LogOut } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Language translations
const translations = {
  en: {
    title: "Factory Fault System",
    dashboard: "Dashboard",
    worker: "Worker Interface",
    reportFault: "Report Fault",
    markResolved: "Mark Resolved",
    factoryMap: "Factory Map",
    faultHistory: "Fault History",
    manageLocations: "Manage Locations",
    reports: "Reports",
    totalFaults: "Total Faults",
    activeFaults: "Active Faults",
    resolvedFaults: "Resolved Faults",
    totalLocations: "Total Locations",
    avgResolutionTime: "Avg Resolution Time",
    minutes: "minutes",
    location: "Location",
    status: "Status",
    duration: "Duration",
    startTime: "Start Time",
    endTime: "End Time",
    description: "Description",
    active: "Active",
    resolved: "Resolved",
    exportData: "Export Data",
    addLocation: "Add Location",
    locationName: "Location Name",
    selectLocation: "Select Location",
    faultDescription: "Fault Description",
    workerID: "Worker ID",
    noActiveFaults: "No active faults",
    faultReported: "Fault reported successfully",
    faultResolved: "Fault resolved successfully"
  },
  fr: {
    title: "Système de Défauts d'Usine",
    dashboard: "Tableau de Bord",
    worker: "Interface Opérateur",
    reportFault: "Signaler un Défaut",
    markResolved: "Marquer Résolu",
    factoryMap: "Carte d'Usine",
    faultHistory: "Historique des Défauts",
    manageLocations: "Gérer les Emplacements",
    reports: "Rapports",
    totalFaults: "Total des Défauts",
    activeFaults: "Défauts Actifs",
    resolvedFaults: "Défauts Résolus",
    totalLocations: "Total des Emplacements",
    avgResolutionTime: "Temps de Résolution Moyen",
    minutes: "minutes",
    location: "Emplacement",
    status: "Statut",
    duration: "Durée",
    startTime: "Heure de Début",
    endTime: "Heure de Fin",
    description: "Description",
    active: "Actif",
    resolved: "Résolu",
    exportData: "Exporter les Données",
    addLocation: "Ajouter un Emplacement",
    locationName: "Nom de l'Emplacement",
    selectLocation: "Sélectionner l'Emplacement",
    faultDescription: "Description du Défaut",
    workerID: "ID Opérateur",
    noActiveFaults: "Aucun défaut actif",
    faultReported: "Défaut signalé avec succès",
    faultResolved: "Défaut résolu avec succès"
  }
};

// Language Context
const LanguageContext = React.createContext();

function LanguageProvider({ children }) {
  const [language, setLanguage] = useState('en');
  const t = (key) => translations[language][key] || key;
  
  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

function useLanguage() {
  const context = React.useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}

// WebSocket Hook
function useWebSocket(url) {
  const [socket, setSocket] = useState(null);
  const [lastMessage, setLastMessage] = useState(null);

  useEffect(() => {
    const wsUrl = url.replace('https://', 'wss://').replace('http://', 'ws://');
    const ws = new WebSocket(`${wsUrl}/ws`);
    
    ws.onopen = () => {
      console.log('WebSocket connected');
      setSocket(ws);
    };
    
    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      setLastMessage(message);
    };
    
    ws.onclose = () => {
      console.log('WebSocket disconnected');
      setSocket(null);
    };
    
    return () => {
      ws.close();
    };
  }, [url]);

  const sendMessage = useCallback((message) => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
    }
  }, [socket]);

  return { socket, lastMessage, sendMessage };
}

// Header Component
function Header() {
  const { language, setLanguage, t } = useLanguage();
  const location = useLocation();
  
  return (
    <header className="bg-white shadow-sm border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center space-x-8">
            <h1 className="text-xl font-bold text-gray-900">{t('title')}</h1>
            <nav className="flex space-x-6">
              <Link 
                to="/" 
                className={`flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium ${
                  location.pathname === '/' 
                    ? 'bg-blue-100 text-blue-700' 
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <Home className="w-4 h-4" />
                <span>{t('dashboard')}</span>
              </Link>
              <Link 
                to="/worker" 
                className={`flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium ${
                  location.pathname === '/worker' 
                    ? 'bg-blue-100 text-blue-700' 
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <User className="w-4 h-4" />
                <span>{t('worker')}</span>
              </Link>
            </nav>
          </div>
          <div className="flex items-center space-x-4">
            <Select value={language} onValueChange={setLanguage}>
              <SelectTrigger className="w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">EN</SelectItem>
                <SelectItem value="fr">FR</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    </header>
  );
}

// Factory Map Component
function FactoryMap({ locations, activeFaults }) {
  const { t } = useLanguage();
  
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <MapPin className="w-5 h-5" />
          <span>{t('factoryMap')}</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative bg-gray-50 rounded-lg p-4" style={{ height: '400px' }}>
          {locations.map((location) => {
            const hasFault = activeFaults[location.name];
            return (
              <div
                key={location.id}
                className={`absolute transform -translate-x-1/2 -translate-y-1/2 ${
                  hasFault ? 'animate-pulse' : ''
                }`}
                style={{
                  left: `${(location.x_position / 800) * 100}%`,
                  top: `${(location.y_position / 600) * 100}%`
                }}
              >
                <div
                  className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-lg cursor-pointer transition-all duration-300 hover:scale-110 ${
                    hasFault 
                      ? 'bg-red-500 hover:bg-red-600' 
                      : 'bg-green-500 hover:bg-green-600'
                  }`}
                  title={`${location.name} - ${location.description} ${hasFault ? '(FAULT ACTIVE)' : '(OK)'}`}
                >
                  {location.name}
                </div>
                {hasFault && (
                  <div className="absolute -top-2 -right-2">
                    <AlertTriangle className="w-6 h-6 text-red-600 animate-bounce" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-4 flex items-center space-x-6 text-sm">
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 bg-green-500 rounded-full"></div>
            <span className="text-gray-600">Normal Operation</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 bg-red-500 rounded-full"></div>
            <span className="text-gray-600">Active Fault</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Stats Cards Component
function StatsCards({ stats }) {
  const { t } = useLanguage();
  
  const statCards = [
    {
      title: t('totalFaults'),
      value: stats.total_faults,
      icon: BarChart3,
      color: 'text-blue-600'
    },
    {
      title: t('activeFaults'),
      value: stats.active_faults,
      icon: AlertTriangle,
      color: 'text-red-600'
    },
    {
      title: t('resolvedFaults'),
      value: stats.resolved_faults,
      icon: CheckCircle,
      color: 'text-green-600'
    },
    {
      title: t('avgResolutionTime'),
      value: `${stats.avg_resolution_time.toFixed(1)} ${t('minutes')}`,
      icon: Clock,
      color: 'text-purple-600'
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
      {statCards.map((stat, index) => (
        <Card key={index} className="bg-white shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">{stat.title}</p>
                <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
              </div>
              <stat.icon className={`w-8 h-8 ${stat.color}`} />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// Fault History Component
function FaultHistory({ faults }) {
  const { t } = useLanguage();
  
  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleString();
  };

  const formatDuration = (minutes) => {
    if (!minutes) return '-';
    if (minutes < 60) return `${minutes.toFixed(1)} min`;
    const hours = Math.floor(minutes / 60);
    const mins = Math.floor(minutes % 60);
    return `${hours}h ${mins}m`;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>{t('faultHistory')}</span>
          <Button 
            onClick={() => window.open(`${API}/export/faults`, '_blank')}
            size="sm"
            className="flex items-center space-x-2"
          >
            <Download className="w-4 h-4" />
            <span>{t('exportData')}</span>
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('location')}</TableHead>
                <TableHead>{t('status')}</TableHead>
                <TableHead>{t('startTime')}</TableHead>
                <TableHead>{t('endTime')}</TableHead>
                <TableHead>{t('duration')}</TableHead>
                <TableHead>{t('description')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {faults.slice(0, 10).map((fault) => (
                <TableRow key={fault.id}>
                  <TableCell className="font-medium">{fault.location_name}</TableCell>
                  <TableCell>
                    <Badge 
                      variant={fault.status === 'open' ? 'destructive' : 'default'}
                      className={fault.status === 'open' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}
                    >
                      {fault.status === 'open' ? t('active') : t('resolved')}
                    </Badge>
                  </TableCell>
                  <TableCell>{formatDate(fault.fault_start)}</TableCell>
                  <TableCell>{formatDate(fault.fault_end)}</TableCell>
                  <TableCell>{formatDuration(fault.duration_minutes)}</TableCell>
                  <TableCell>{fault.description || '-'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

// Dashboard Component
function Dashboard() {
  const [stats, setStats] = useState({
    total_faults: 0,
    active_faults: 0,
    resolved_faults: 0,
    total_locations: 0,
    avg_resolution_time: 0
  });
  const [locations, setLocations] = useState([]);
  const [activeFaults, setActiveFaults] = useState({});
  const [faults, setFaults] = useState([]);
  const { lastMessage } = useWebSocket(BACKEND_URL);

  const fetchData = async () => {
    try {
      const [statsRes, locationsRes, activeFaultsRes, faultsRes] = await Promise.all([
        axios.get(`${API}/dashboard/stats`),
        axios.get(`${API}/locations`),
        axios.get(`${API}/faults/active`),
        axios.get(`${API}/faults`)
      ]);
      
      setStats(statsRes.data);
      setLocations(locationsRes.data);
      setActiveFaults(activeFaultsRes.data);
      setFaults(faultsRes.data);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (lastMessage) {
      fetchData(); // Refresh data on WebSocket updates
    }
  }, [lastMessage]);

  return (
    <div className="space-y-8">
      <StatsCards stats={stats} />
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <FactoryMap locations={locations} activeFaults={activeFaults} />
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Recent Activity</CardTitle>
            </CardHeader>
            <CardContent>
              {faults.slice(0, 5).map((fault) => (
                <div key={fault.id} className="flex items-center space-x-3 py-2 border-b last:border-b-0">
                  {fault.status === 'open' ? (
                    <AlertTriangle className="w-5 h-5 text-red-500" />
                  ) : (
                    <CheckCircle className="w-5 h-5 text-green-500" />
                  )}
                  <div className="flex-1">
                    <p className="text-sm font-medium">{fault.location_name}</p>
                    <p className="text-xs text-gray-500">
                      {new Date(fault.fault_start).toLocaleString()}
                    </p>
                  </div>
                  <Badge 
                    variant={fault.status === 'open' ? 'destructive' : 'default'}
                    className="text-xs"
                  >
                    {fault.status}
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
      
      <FaultHistory faults={faults} />
    </div>
  );
}

// Worker Interface Component
function WorkerInterface() {
  const { t } = useLanguage();
  const [locations, setLocations] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState('');
  const [description, setDescription] = useState('');
  const [workerUuid, setWorkerUuid] = useState('');
  const [activeFaults, setActiveFaults] = useState({});
  const { lastMessage } = useWebSocket(BACKEND_URL);

  useEffect(() => {
    // Generate or get worker UUID
    let uuid = localStorage.getItem('workerUuid');
    if (!uuid) {
      uuid = `worker-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem('workerUuid', uuid);
    }
    setWorkerUuid(uuid);

    fetchData();
  }, []);

  useEffect(() => {
    if (lastMessage) {
      fetchData();
    }
  }, [lastMessage]);

  const fetchData = async () => {
    try {
      const [locationsRes, activeFaultsRes] = await Promise.all([
        axios.get(`${API}/locations`),
        axios.get(`${API}/faults/active`)
      ]);
      
      setLocations(locationsRes.data);
      setActiveFaults(activeFaultsRes.data);
    } catch (error) {
      console.error('Error fetching worker data:', error);
    }
  };

  const reportFault = async () => {
    if (!selectedLocation) return;
    
    try {
      await axios.post(`${API}/faults/report`, {
        worker_uuid: workerUuid,
        location_name: selectedLocation,
        description: description
      });
      
      setDescription('');
      alert(t('faultReported'));
    } catch (error) {
      console.error('Error reporting fault:', error);
      alert(error.response?.data?.detail || 'Error reporting fault');
    }
  };

  const resolveFault = async () => {
    if (!selectedLocation) return;
    
    const activeFault = activeFaults[selectedLocation];
    if (!activeFault) {
      alert('No active fault at this location');
      return;
    }
    
    try {
      await axios.post(`${API}/faults/resolve`, {
        fault_id: activeFault.id
      });
      
      alert(t('faultResolved'));
    } catch (error) {
      console.error('Error resolving fault:', error);
      alert(error.response?.data?.detail || 'Error resolving fault');
    }
  };

  const currentFault = selectedLocation ? activeFaults[selectedLocation] : null;

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <User className="w-5 h-5" />
            <span>{t('worker')}</span>
          </CardTitle>
          <CardDescription>
            {t('workerID')}: {workerUuid}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="location">{t('selectLocation')}</Label>
            <Select value={selectedLocation} onValueChange={setSelectedLocation}>
              <SelectTrigger>
                <SelectValue placeholder={t('selectLocation')} />
              </SelectTrigger>
              <SelectContent>
                {locations.map((location) => (
                  <SelectItem key={location.id} value={location.name}>
                    {location.name} - {location.description}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedLocation && (
            <div className={`p-4 rounded-lg ${currentFault ? 'bg-red-50 border border-red-200' : 'bg-gray-50'}`}>
              <div className="flex items-center space-x-2 mb-2">
                <MapPin className="w-4 h-4" />
                <span className="font-medium">{selectedLocation}</span>
                {currentFault ? (
                  <Badge variant="destructive" className="bg-red-100 text-red-800">
                    {t('active')} - {new Date(currentFault.fault_start).toLocaleString()}
                  </Badge>
                ) : (
                  <Badge className="bg-green-100 text-green-800">OK</Badge>
                )}
              </div>
              
              {currentFault && currentFault.description && (
                <div className="mt-3 p-3 bg-white border border-red-200 rounded-md">
                  <p className="text-sm font-medium text-red-800 mb-1">Current Fault Description:</p>
                  <p className="text-sm text-gray-700 bg-gray-50 p-2 rounded border-l-4 border-red-400">
                    "{currentFault.description}"
                  </p>
                  <p className="text-xs text-gray-500 mt-2">
                    Reported by: {currentFault.worker_uuid} • Duration: {Math.floor((new Date() - new Date(currentFault.fault_start)) / 60000)} minutes
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="description">{t('faultDescription')}</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('faultDescription')}
              rows={3}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Button
              onClick={reportFault}
              disabled={!selectedLocation || !!currentFault}
              className="bg-red-600 hover:bg-red-700 text-white flex items-center space-x-2"
              size="lg"
            >
              <AlertTriangle className="w-5 h-5" />
              <span>{t('reportFault')}</span>
            </Button>

            <Button
              onClick={resolveFault}
              disabled={!selectedLocation || !currentFault}
              className="bg-green-600 hover:bg-green-700 text-white flex items-center space-x-2"
              size="lg"
            >
              <CheckCircle className="w-5 h-5" />
              <span>{t('markResolved')}</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {currentFault && (
        <Card className="border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle className="text-red-800 flex items-center space-x-2">
              <AlertTriangle className="w-5 h-5" />
              <span>Active Fault at {selectedLocation}</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <p><strong>Started:</strong> {new Date(currentFault.fault_start).toLocaleString()}</p>
              <p><strong>Duration:</strong> {Math.floor((new Date() - new Date(currentFault.fault_start)) / 60000)} minutes</p>
              {currentFault.description && (
                <p><strong>Description:</strong> {currentFault.description}</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// Main App Component
function App() {
  return (
    <LanguageProvider>
      <div className="min-h-screen bg-gray-50">
        <BrowserRouter>
          <Header />
          <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/worker" element={<WorkerInterface />} />
            </Routes>
          </main>
        </BrowserRouter>
      </div>
    </LanguageProvider>
  );
}

export default App;