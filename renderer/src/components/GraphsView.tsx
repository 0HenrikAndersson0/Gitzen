import { useState, useEffect } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
    PieChart, Pie, Cell, AreaChart, Area, ScatterChart, Scatter, ZAxis
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { LoadingOverlay } from './ui/spinner';
import { FileDiff, Activity, Users, TrendingUp, PieChart as PieChartIcon } from 'lucide-react';

interface FileChurnData { path: string; changes: number; }
interface ActivityData { day: number; hour: number; count: number; }
interface ContributorData { name: string; commits: number; }
interface GrowthData { date: string; additions: number; deletions: number; totalLines: number; }
interface DistributionData { type: string; count: number; }

const COLORS = ['#8884d8', '#82ca9d', '#ffc658', '#ff7300', '#0088fe', '#00c49f', '#ffbb28', '#ff8042', '#a4de6c', '#d0ed57'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function GraphsView() {
    const [churnData, setChurnData] = useState<FileChurnData[]>([]);
    const [activityData, setActivityData] = useState<ActivityData[]>([]);
    const [contributorData, setContributorData] = useState<ContributorData[]>([]);
    const [growthData, setGrowthData] = useState<GrowthData[]>([]);
    const [distributionData, setDistributionData] = useState<DistributionData[]>([]);

    const [visibleCharts, setVisibleCharts] = useState({
        growth: true,
        contributors: true,
        distribution: true,
        activity: true,
        churn: true
    });

    const toggleChart = (key: keyof typeof visibleCharts) => {
        setVisibleCharts(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const CHART_CONFIG = [
        { key: 'growth', label: 'Codebase Growth', icon: TrendingUp, color: 'text-green-400' },
        { key: 'contributors', label: 'Top Contributors', icon: Users, color: 'text-blue-400' },
        { key: 'distribution', label: 'File Types', icon: PieChartIcon, color: 'text-orange-400' },
        { key: 'activity', label: 'Commit Activity', icon: Activity, color: 'text-yellow-400' },
        { key: 'churn', label: 'File Churn', icon: FileDiff, color: 'text-purple-400' }
    ] as const;

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let isMounted = true;

        async function loadData() {
            try {
                setLoading(true);

                const [churnRes, activityRes, contribRes, growthRes, distRes] = await Promise.all([
                    window.electronAPI.getFilesChurn(10),
                    window.electronAPI.getCommitActivity(),
                    window.electronAPI.getTopContributors(10),
                    window.electronAPI.getCodebaseGrowth(),
                    window.electronAPI.getFileTypeDistribution()
                ]);

                if (!isMounted) return;

                if (churnRes.success && activityRes.success && contribRes.success && growthRes.success && distRes.success) {
                    setChurnData(churnRes.files || []);
                    setActivityData(activityRes.activity || []);
                    setContributorData(contribRes.contributors || []);
                    // To make growth graph look good if huge, we might just sample it, but recharts handles it ok.
                    setGrowthData(growthRes.growth || []);
                    setDistributionData(distRes.distribution || []);
                    setError(null);
                } else {
                    setError('Failed to load some graph data');
                }
            } catch (err: any) {
                if (!isMounted) return;
                setError(err.message || 'Error executing graph commands');
            } finally {
                if (isMounted) {
                    setLoading(false);
                }
            }
        }

        loadData();

        return () => {
            isMounted = false;
        };
    }, []);

    if (loading) {
        return (
            <div className="flex-1 flex items-center justify-center p-6 min-h-[400px]">
                <LoadingOverlay message="Analyzing git commit history for graphs..." />
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex-1 p-6 flex flex-col items-center justify-center text-center text-muted-foreground min-h-[400px]">
                <p className="text-red-400 mb-2">Error loading graph data</p>
                <p className="text-sm">{error}</p>
            </div>
        );
    }

    return (
        <div className="flex-1 p-6 overflow-y-auto space-y-6">
            <div className="flex flex-col gap-4 mb-6">
                <h2 className="text-2xl font-bold text-foreground">Repository Insights</h2>
                <div className="flex flex-wrap items-center gap-2">
                    {CHART_CONFIG.map(({ key, label, icon: Icon, color }) => (
                        <button
                            key={key}
                            onClick={() => toggleChart(key)}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${visibleCharts[key]
                                ? 'bg-primary/10 border-primary/30 text-foreground'
                                : 'bg-card/50 border-border text-muted-foreground opacity-60 hover:opacity-100 hover:bg-accent'
                                }`}
                        >
                            <Icon className={`size-4 ${visibleCharts[key] ? color : ''}`} />
                            {label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                {/* Codebase Growth Chart */}
                {visibleCharts.growth && (
                    <Card className="border-border bg-card/50 col-span-1 lg:col-span-2">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <TrendingUp className="size-5 text-green-400" />
                                Codebase Growth Over Time
                            </CardTitle>
                            <CardDescription>
                                Net total lines of code over the repository's history (additions - deletions).
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="h-[300px] w-full mt-4">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={growthData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                                    <XAxis dataKey="date" stroke="#888" fontSize={12} minTickGap={30} />
                                    <YAxis stroke="#888" fontSize={12} />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: '#1e1e1e', borderColor: '#333', borderRadius: '6px' }}
                                        itemStyle={{ color: '#ccc' }}
                                    />
                                    <Area type="monotone" dataKey="totalLines" stroke="#82ca9d" fill="#82ca9d" fillOpacity={0.3} name="Total Lines" />
                                </AreaChart>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>
                )}

                {/* Top Contributors Chart */}
                {visibleCharts.contributors && (
                    <Card className="border-border bg-card/50">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Users className="size-5 text-blue-400" />
                                Top Contributors
                            </CardTitle>
                            <CardDescription>
                                Most active authors by number of commits.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="h-[300px] w-full mt-4">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={contributorData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#333" />
                                    <XAxis dataKey="name" stroke="#888" fontSize={12} tickLine={false} axisLine={false} />
                                    <YAxis stroke="#888" fontSize={12} tickLine={false} axisLine={false} />
                                    <Tooltip
                                        cursor={{ fill: 'transparent' }}
                                        contentStyle={{ backgroundColor: '#1e1e1e', borderColor: '#333', borderRadius: '6px' }}
                                    />
                                    <Bar dataKey="commits" fill="#0088fe" radius={[4, 4, 0, 0]} name="Commits" />
                                </BarChart>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>
                )}

                {/* File Type Distribution */}
                {visibleCharts.distribution && (
                    <Card className="border-border bg-card/50">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <PieChartIcon className="size-5 text-orange-400" />
                                File Type Distribution
                            </CardTitle>
                            <CardDescription>
                                Breakdown of the repository by file extension.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="h-[300px] w-full mt-4">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={distributionData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={60}
                                        outerRadius={100}
                                        paddingAngle={2}
                                        dataKey="count"
                                        nameKey="type"
                                    >
                                        {distributionData.map((_, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip
                                        wrapperClassName="pie-tooltip-white-numbers"
                                        contentStyle={{ backgroundColor: '#1e1e1e', borderColor: '#333', borderRadius: '6px' }}
                                        formatter={(value: number | undefined, name: string | undefined) => [`${value || 0} files`, name || '']}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>
                )}

                {/* Commit Activity Heatmap */}
                {visibleCharts.activity && (
                    <Card className="border-border bg-card/50 lg:col-span-2">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Activity className="size-5 text-yellow-400" />
                                Commit Activity Punchcard
                            </CardTitle>
                            <CardDescription>
                                When do commits happen? Hourly activity mapped to days of the week.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="h-[300px] w-full mt-4">
                            <ResponsiveContainer width="100%" height="100%">
                                <ScatterChart margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                                    <XAxis
                                        type="number"
                                        dataKey="hour"
                                        name="Hour"
                                        domain={[0, 23]}
                                        tickCount={24}
                                        stroke="#888"
                                        fontSize={12}
                                    />
                                    <YAxis
                                        type="number"
                                        dataKey="day"
                                        name="Day"
                                        tickFormatter={(v) => DAYS[v] || ''}
                                        domain={[0, 6]}
                                        tickCount={7}
                                        stroke="#888"
                                        fontSize={12}
                                    />
                                    <ZAxis type="number" dataKey="count" range={[40, 400]} name="Commits" />
                                    <Tooltip
                                        cursor={{ strokeDasharray: '3 3' }}
                                        wrapperClassName="activity-tooltip-white-text"
                                        contentStyle={{ backgroundColor: '#1e1e1e', borderColor: '#333', borderRadius: '6px' }}
                                        formatter={(value: any, name: string | undefined) => {
                                            if (name === 'Day') return DAYS[value as number];
                                            if (name === 'Hour') return `${value}:00`;
                                            return value;
                                        }}
                                    />
                                    <Scatter name="Activity" data={activityData} fill="#ffc658" opacity={0.8} />
                                </ScatterChart>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>
                )}

                {/* Most Frequently Changed Files */}
                {visibleCharts.churn && (
                    <Card className="border-border bg-card/50 lg:col-span-2">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <FileDiff className="size-5 text-purple-400" />
                                File Churn
                            </CardTitle>
                            <CardDescription>
                                Top files with the most commits throughout the entire repository history.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="h-[400px] w-full mt-4">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart
                                    data={churnData}
                                    layout="vertical"
                                    margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                                >
                                    <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#333" />
                                    <XAxis type="number" stroke="#888" fontSize={12} tickLine={false} axisLine={false} />
                                    <YAxis
                                        type="category"
                                        dataKey="path"
                                        stroke="#888"
                                        fontSize={12}
                                        width={250}
                                        tickFormatter={(value) => {
                                            if (value.length > 35) {
                                                return '...' + value.substring(value.length - 32);
                                            }
                                            return value;
                                        }}
                                        tickLine={false}
                                        axisLine={false}
                                    />
                                    <Tooltip
                                        cursor={{ fill: 'transparent' }}
                                        contentStyle={{ backgroundColor: '#1e1e1e', borderColor: '#333', borderRadius: '6px' }}
                                    />
                                    <Bar
                                        dataKey="changes"
                                        fill="#8884d8"
                                        radius={[0, 4, 4, 0]}
                                        barSize={20}
                                        name="Commits"
                                    />
                                </BarChart>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>
                )}

            </div>
        </div>
    );
}
