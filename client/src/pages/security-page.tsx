import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { getVulnerabilityScans, getSeverityColor } from "@/lib/vulnerability-service";
import { getMalwareScans, getScanStatusColor, getMalwareChartData } from "@/lib/malware-service";
import { AlertTriangle, CheckCircle, Server, AlertCircle, Shield, Bug, FileWarning } from "lucide-react";
import { format } from "date-fns";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import VulnerabilityDetailsDialog from "@/components/vulnerability-details-dialog";
import MalwareDetailsDialog from "@/components/malware-details-dialog";
import { Server as ServerType } from "@shared/schema";
import { 
  Chart as ChartJS, 
  ArcElement, 
  Tooltip, 
  Legend,
  CategoryScale,
  LinearScale,
  BarElement
} from 'chart.js';
import { Doughnut, Bar } from 'react-chartjs-2';

// Register Chart.js components
ChartJS.register(
  ArcElement, 
  Tooltip, 
  Legend,
  CategoryScale,
  LinearScale,
  BarElement
);

export default function SecurityPage() {
  const { data: allVulnerabilityScans, isLoading: isVulScansLoading, refetch: refetchVulScans } = useQuery({
    queryKey: ['/api/vulnerability-scans'],
    queryFn: async () => {
      return await getVulnerabilityScans();
    },
    refetchInterval: 30000 // Refresh every 30 seconds
  });

  const { data: allMalwareScans, isLoading: isMalwareScansLoading, refetch: refetchMalwareScans } = useQuery({
    queryKey: ['/api/malware-scans'],
    queryFn: async () => {
      return await getMalwareScans();
    },
    refetchInterval: 30000 // Refresh every 30 seconds
  });

  const { data: malwareChartData, isLoading: isMalwareChartLoading } = useQuery({
    queryKey: ['/api/malware-chart-data'],
    queryFn: async () => {
      return await getMalwareChartData();
    },
    enabled: !!allMalwareScans && allMalwareScans.length > 0
  });

  const { data: servers } = useQuery<ServerType[]>({
    queryKey: ['/api/servers'],
  });

  const [selectedVulScanId, setSelectedVulScanId] = useState<number | null>(null);
  const [selectedMalwareScanId, setSelectedMalwareScanId] = useState<number | null>(null);

  // Group scans by server for statistics
  const scansByServer = allVulnerabilityScans?.reduce((acc: { [key: number]: any[] }, scan: any) => {
    if (!acc[scan.serverId]) {
      acc[scan.serverId] = [];
    }
    acc[scan.serverId].push(scan);
    return acc;
  }, {} as { [key: number]: any[] }) || {};

  // Calculate security statistics
  const calculateStats = () => {
    if (!allVulnerabilityScans || allVulnerabilityScans.length === 0) {
      return {
        totalScans: 0,
        totalVulnerabilities: 0,
        criticalVulnerabilities: 0,
        highVulnerabilities: 0,
        mediumVulnerabilities: 0,
        lowVulnerabilities: 0,
        secureServers: 0,
        vulnerableServers: 0,
        notScannedServers: 0,
      };
    }

    const stats = {
      totalScans: allVulnerabilityScans.length,
      totalVulnerabilities: 0,
      criticalVulnerabilities: 0,
      highVulnerabilities: 0,
      mediumVulnerabilities: 0,
      lowVulnerabilities: 0,
      secureServers: 0,
      vulnerableServers: 0,
      notScannedServers: 0,
    };

    // Count vulnerabilities by severity
    allVulnerabilityScans.forEach((scan: any) => {
      stats.criticalVulnerabilities += scan.criticalCount || 0;
      stats.highVulnerabilities += scan.highCount || 0;
      stats.mediumVulnerabilities += scan.mediumCount || 0;
      stats.lowVulnerabilities += scan.lowCount || 0;
    });

    stats.totalVulnerabilities = 
      stats.criticalVulnerabilities +
      stats.highVulnerabilities +
      stats.mediumVulnerabilities +
      stats.lowVulnerabilities;

    // Count servers with/without vulnerabilities
    const scannedServerIds = new Set(allVulnerabilityScans.map((scan: any) => scan.serverId));
    
    Object.keys(scansByServer).forEach(serverId => {
      const serverScans = scansByServer[Number(serverId)];
      const latestScan = serverScans.sort((a: any, b: any) => {
        return new Date(b.scanDate).getTime() - new Date(a.scanDate).getTime();
      })[0];

      if (!latestScan) return;

      const hasVulnerabilities = 
        (latestScan.criticalCount || 0) > 0 ||
        (latestScan.highCount || 0) > 0 ||
        (latestScan.mediumCount || 0) > 0 ||
        (latestScan.lowCount || 0) > 0;

      if (hasVulnerabilities) {
        stats.vulnerableServers++;
      } else {
        stats.secureServers++;
      }
    });

    if (servers) {
      stats.notScannedServers = servers.length - scannedServerIds.size;
    }

    return stats;
  };

  const stats = calculateStats();

  const getServerName = (serverId: number) => {
    if (!servers) return `Server ${serverId}`;
    const server = servers.find(s => s.id === serverId);
    return server ? server.name : `Server ${serverId}`;
  };

  return (
    <div className="container mx-auto py-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Security Center</h1>
        <div className="flex gap-2">
          <Link href="/servers">
            <Button variant="outline">
              <Server className="mr-2 h-4 w-4" />
              Servers
            </Button>
          </Link>
        </div>
      </div>

      {/* Security Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="p-6 flex flex-col items-center justify-center text-center">
            <div className="p-3 bg-red-100 rounded-full mb-3">
              <AlertTriangle className="h-6 w-6 text-red-600" />
            </div>
            <h3 className="text-xl font-semibold">{stats.criticalVulnerabilities + stats.highVulnerabilities}</h3>
            <p className="text-sm text-gray-500">Critical & High Vulnerabilities</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 flex flex-col items-center justify-center text-center">
            <div className="p-3 bg-yellow-100 rounded-full mb-3">
              <AlertCircle className="h-6 w-6 text-yellow-600" />
            </div>
            <h3 className="text-xl font-semibold">{stats.mediumVulnerabilities + stats.lowVulnerabilities}</h3>
            <p className="text-sm text-gray-500">Medium & Low Vulnerabilities</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 flex flex-col items-center justify-center text-center">
            <div className="p-3 bg-green-100 rounded-full mb-3">
              <CheckCircle className="h-6 w-6 text-green-600" />
            </div>
            <h3 className="text-xl font-semibold">{stats.secureServers}</h3>
            <p className="text-sm text-gray-500">Secure Servers</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 flex flex-col items-center justify-center text-center">
            <div className="p-3 bg-blue-100 rounded-full mb-3">
              <Shield className="h-6 w-6 text-blue-600" />
            </div>
            <h3 className="text-xl font-semibold">{stats.totalScans}</h3>
            <p className="text-sm text-gray-500">Total Scans Run</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="vulnerabilities">
        <TabsList className="mb-4">
          <TabsTrigger value="vulnerabilities">
            <AlertTriangle className="h-4 w-4 mr-2" />
            Vulnerability Scans
          </TabsTrigger>
          <TabsTrigger value="malware">
            <Bug className="h-4 w-4 mr-2" />
            Malware Detection
          </TabsTrigger>
        </TabsList>

        <TabsContent value="vulnerabilities">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-lg">Vulnerability Scan Summary</CardTitle>
              <div className="flex items-center gap-2">
                <Button onClick={() => refetchVulScans()} variant="outline" size="sm">
                  Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {isVulScansLoading ? (
                <div className="text-center p-6">Loading vulnerability scan data...</div>
              ) : allVulnerabilityScans && allVulnerabilityScans.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Server</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Scan Date</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Findings</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {/* Get the latest scan for each server */}
                      {Object.values(
                        allVulnerabilityScans.reduce((acc: {[key: number]: any}, scan: any) => {
                          // If we haven't seen this server yet or this scan is newer than the one we have, update it
                          if (!acc[scan.serverId] || new Date(scan.scanDate).getTime() > new Date(acc[scan.serverId].scanDate).getTime()) {
                            acc[scan.serverId] = scan;
                          }
                          return acc;
                        }, {})
                      ).map((scan: any) => (
                        <tr key={scan.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            <Link href={`/servers/${scan.serverId}`} className="text-blue-600 hover:underline flex items-center">
                                <Server className="h-4 w-4 mr-1" />
                                {getServerName(scan.serverId)}
                            </Link>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {scan.scanDate ? format(new Date(scan.scanDate), 'MMM dd, yyyy HH:mm') : 'N/A'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex flex-wrap gap-1">
                              {(scan.criticalCount || 0) > 0 && (
                                <Badge className="bg-red-100 text-red-800">
                                  {scan.criticalCount} Critical
                                </Badge>
                              )}
                              {(scan.highCount || 0) > 0 && (
                                <Badge className="bg-orange-100 text-orange-800">
                                  {scan.highCount} High
                                </Badge>
                              )}
                              {(scan.mediumCount || 0) > 0 && (
                                <Badge className="bg-yellow-100 text-yellow-800">
                                  {scan.mediumCount} Medium
                                </Badge>
                              )}
                              {(scan.lowCount || 0) > 0 && (
                                <Badge className="bg-blue-100 text-blue-800">
                                  {scan.lowCount} Low
                                </Badge>
                              )}
                              {(scan.criticalCount || 0) === 0 && (scan.highCount || 0) === 0 &&
                               (scan.mediumCount || 0) === 0 && (scan.lowCount || 0) === 0 &&
                               scan.status === 'success' && (
                                <Badge variant="outline" className="text-green-600">
                                  No issues found
                                </Badge>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <Badge
                              className={
                                scan.status === 'running'
                                  ? "bg-blue-100 text-blue-800"
                                  : scan.status === 'success'
                                  ? "bg-green-100 text-green-800"
                                  : scan.status === 'failed'
                                  ? "bg-red-100 text-red-800"
                                  : "bg-gray-100 text-gray-800"
                              }
                            >
                              {scan.status ? scan.status.charAt(0).toUpperCase() + scan.status.slice(1) : 'Unknown'}
                            </Badge>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            <Button 
                              variant="outline" 
                              size="sm" 
                              onClick={() => setSelectedVulScanId(scan.id)}
                              disabled={scan.status !== 'success'}
                            >
                              View Details
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center p-6">
                  <p className="text-gray-500 mb-4">No vulnerability scans have been performed yet.</p>
                  <p className="mb-4">Start a scan from the individual server pages to assess vulnerabilities.</p>
                  <Link href="/servers">
                    <Button>Go to Servers</Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
          
          {/* Server security status table */}
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-lg">Server Security Status</CardTitle>
            </CardHeader>
            <CardContent>
              {servers && servers.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Server</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Scan</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Security Status</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {servers.map((server) => {
                        const serverScans = scansByServer[server.id] || [];
                        const latestScan = serverScans.sort((a: any, b: any) => {
                          return new Date(b.scanDate).getTime() - new Date(a.scanDate).getTime();
                        })[0];
                        
                        const hasVulnerabilities = latestScan && (
                          (latestScan.criticalCount || 0) > 0 ||
                          (latestScan.highCount || 0) > 0 ||
                          (latestScan.mediumCount || 0) > 0 ||
                          (latestScan.lowCount || 0) > 0
                        );
                        
                        return (
                          <tr key={server.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                              <Link href={`/servers/${server.id}`} className="text-blue-600 hover:underline flex items-center">
                                  <Server className="h-4 w-4 mr-1" />
                                  {server.name}
                              </Link>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {latestScan && latestScan.scanDate ? (
                                format(new Date(latestScan.scanDate), 'MMM dd, yyyy HH:mm')
                              ) : (
                                'Never scanned'
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              {!latestScan ? (
                                <Badge variant="outline" className="bg-gray-100 text-gray-800">
                                  Unknown
                                </Badge>
                              ) : latestScan.status !== 'success' ? (
                                <Badge className="bg-gray-100 text-gray-800">
                                  {latestScan.status === 'running' ? 'Scan in progress' : 'Scan failed'}
                                </Badge>
                              ) : hasVulnerabilities ? (
                                <Badge className="bg-red-100 text-red-800">
                                  Vulnerable
                                </Badge>
                              ) : (
                                <Badge className="bg-green-100 text-green-800">
                                  Secure
                                </Badge>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                              <Link href={`/servers/${server.id}`}>
                                <Button variant="outline" size="sm">
                                  View Server
                                </Button>
                              </Link>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center p-6">
                  <p className="text-gray-500 mb-4">No servers available to monitor.</p>
                  <Link href="/servers">
                    <Button>Add Servers</Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="malware">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-lg">Malware Scan Summary</CardTitle>
              <div className="flex items-center gap-2">
                <Button onClick={() => refetchMalwareScans()} variant="outline" size="sm">
                  Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {isMalwareScansLoading ? (
                <div className="text-center p-6">Loading malware scan data...</div>
              ) : allMalwareScans && allMalwareScans.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Server</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Scan Date</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Findings</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {/* Get the latest scan for each server */}
                      {Object.values(
                        allMalwareScans.reduce((acc: {[key: number]: any}, scan: any) => {
                          // If we haven't seen this server yet or this scan is newer than the one we have, update it
                          if (!acc[scan.serverId] || new Date(scan.scanDate).getTime() > new Date(acc[scan.serverId].scanDate).getTime()) {
                            acc[scan.serverId] = scan;
                          }
                          return acc;
                        }, {})
                      ).map((scan: any) => (
                        <tr key={scan.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            <Link href={`/servers/${scan.serverId}`} className="text-blue-600 hover:underline flex items-center">
                                <Server className="h-4 w-4 mr-1" />
                                {getServerName(scan.serverId)}
                            </Link>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {scan.scanDate ? format(new Date(scan.scanDate), 'MMM dd, yyyy HH:mm') : 'N/A'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <Badge
                              className={
                                (scan.threatCount || 0) > 0
                                  ? "bg-red-100 text-red-800"
                                  : "bg-green-100 text-green-800"
                              }
                            >
                              {(scan.threatCount || 0) > 0 ? `${scan.threatCount} Threats Found` : 'No Threats'}
                            </Badge>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <Badge className={getScanStatusColor(scan.status)}>
                              {scan.status ? scan.status.charAt(0).toUpperCase() + scan.status.slice(1) : 'Unknown'}
                            </Badge>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            <Button 
                              variant="outline" 
                              size="sm" 
                              onClick={() => setSelectedMalwareScanId(scan.id)}
                              disabled={scan.status !== 'success'}
                            >
                              View Details
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center p-6">
                  <p className="text-gray-500 mb-4">No malware scans have been performed yet.</p>
                  <p className="mb-4">Start a scan from the individual server pages to detect malware.</p>
                  <Link href="/servers">
                    <Button>Go to Servers</Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
          
          {/* Malware Threat Distribution Chart */}
          {malwareChartData && !isMalwareChartLoading && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Threat Distribution</CardTitle>
                </CardHeader>
                <CardContent className="flex justify-center p-6">
                  <div style={{ height: '300px', width: '300px' }}>
                    <Doughnut 
                      data={malwareChartData}
                      options={{
                        plugins: {
                          legend: {
                            position: 'right',
                          }
                        },
                        maintainAspectRatio: false
                      }}
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Malware Protection Status</CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-green-50 p-4 rounded-lg text-center">
                      <div className="text-3xl font-bold text-green-600 mb-2">
                        {servers?.filter(s => {
                          const scan = allMalwareScans?.find(scan => 
                            scan.serverId === s.id && 
                            scan.status === 'success' && 
                            (scan.threatCount || 0) === 0
                          );
                          return !!scan;
                        }).length || 0}
                      </div>
                      <div className="text-sm text-green-600">Clean Servers</div>
                    </div>
                    
                    <div className="bg-red-50 p-4 rounded-lg text-center">
                      <div className="text-3xl font-bold text-red-600 mb-2">
                        {servers?.filter(s => {
                          const scan = allMalwareScans?.find(scan => 
                            scan.serverId === s.id && 
                            scan.status === 'success' && 
                            (scan.threatCount || 0) > 0
                          );
                          return !!scan;
                        }).length || 0}
                      </div>
                      <div className="text-sm text-red-600">Infected Servers</div>
                    </div>
                    
                    <div className="bg-blue-50 p-4 rounded-lg text-center">
                      <div className="text-3xl font-bold text-blue-600 mb-2">
                        {allMalwareScans?.filter(scan => scan.status === 'success').length || 0}
                      </div>
                      <div className="text-sm text-blue-600">Total Scans</div>
                    </div>
                    
                    <div className="bg-amber-50 p-4 rounded-lg text-center">
                      <div className="text-3xl font-bold text-amber-600 mb-2">
                        {servers?.filter(s => !allMalwareScans?.some(scan => scan.serverId === s.id)).length || 0}
                      </div>
                      <div className="text-sm text-amber-600">Unscanned Servers</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
          
          {/* Information about ClamAV */}
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-lg">About Malware Scanning</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="flex flex-col md:flex-row gap-4 items-center md:items-start">
                <div className="bg-blue-50 p-4 rounded-full">
                  <FileWarning className="h-10 w-10 text-blue-600" />
                </div>
                <div>
                  <h3 className="text-lg font-medium mb-2">ClamAV Malware Detection</h3>
                  <p className="text-gray-600 mb-4">
                    LinuxControl uses ClamAV, a powerful open-source antivirus engine, to scan your Linux servers for viruses, 
                    trojans, malware, and other security threats. ClamAV will be automatically installed on servers that don't have it.
                  </p>
                  <div className="bg-amber-50 border border-amber-200 rounded-md p-4 text-amber-800 text-sm">
                    <strong>Note:</strong> Initial malware scans may take a considerable amount of time depending on the size of 
                    the filesystem being scanned. You can specify a target directory to scan instead of the entire filesystem.
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Vulnerability details dialog */}
      <VulnerabilityDetailsDialog
        scanId={selectedVulScanId || 0}
        onClose={() => setSelectedVulScanId(null)}
        open={!!selectedVulScanId}
      />
      
      {/* Malware details dialog */}
      <MalwareDetailsDialog
        open={!!selectedMalwareScanId}
        onOpenChange={(open) => {
          if (!open) setSelectedMalwareScanId(null);
        }}
        scanId={selectedMalwareScanId}
      />
    </div>
  );
}