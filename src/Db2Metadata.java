import java.sql.*;
import java.util.*;
import java.io.*;
import java.nio.charset.StandardCharsets;

class Db2Metadata {
  static Map<String,Object> obj(Object... pairs){Map<String,Object> m=new LinkedHashMap<>();for(int i=0;i<pairs.length;i+=2)m.put((String)pairs[i],pairs[i+1]);return m;}
  static String str(String s){return s==null?"":s;}
  static String json(Object o){
    if(o==null)return "null";
    if(o instanceof Map<?,?> m){List<String> a=new ArrayList<>();m.forEach((k,v)->a.add(json(k.toString())+":"+json(v)));return "{"+String.join(",",a)+"}";}
    if(o instanceof Collection<?> c){List<String>a=new ArrayList<>();for(Object v:c)a.add(json(v));return "["+String.join(",",a)+"]";}
    if(o instanceof Number||o instanceof Boolean)return o.toString();
    StringBuilder b=new StringBuilder("\"");for(char c:o.toString().toCharArray()){switch(c){case '"':b.append("\\\"");break;case '\\':b.append("\\\\");break;default:if(c<32)b.append(String.format("\\u%04x",(int)c));else b.append(c);}}return b.append('"').toString();
  }
  static String pattern(DatabaseMetaData m,String s)throws SQLException {String e=m.getSearchStringEscape();return s.replace(e,e+e).replace("_",e+"_").replace("%",e+"%");}
  public static void main(String[] args){try{
    System.setOut(new PrintStream(System.out,true,StandardCharsets.UTF_8));System.setErr(new PrintStream(System.err,true,StandardCharsets.UTF_8));
    BufferedReader in=new BufferedReader(new InputStreamReader(System.in,StandardCharsets.UTF_8));String[] v=new String[5];for(int i=0;i<v.length;i++)v[i]=new String(Base64.getDecoder().decode(in.readLine()),StandardCharsets.UTF_8);
    Class.forName("com.ibm.db2.jcc.DB2Driver");DriverManager.setLoginTimeout(15);
    Properties props=new Properties();props.setProperty("user",v[1]);props.setProperty("password",v[2]);props.setProperty("blockingReadConnectionTimeout","30");props.setProperty("loginTimeout","15");
    try(Connection c=DriverManager.getConnection(v[0],props)){
      DatabaseMetaData m=c.getMetaData();List<Object> tables=new ArrayList<>(),diagnostics=new ArrayList<>();
      if(v[4].equals("test")){System.out.print(json(obj("product",m.getDatabaseProductName(),"version",m.getDatabaseProductVersion())));return;}
      List<String[]> names=new ArrayList<>();try(ResultSet r=m.getTables(null,pattern(m,v[3]),"%",new String[]{"TABLE"})){while(r.next()){if(names.size()>=500)throw new SQLException("한 번에 500개 테이블까지 읽을 수 있습니다. 스키마를 좁혀주세요.");names.add(new String[]{r.getString("TABLE_SCHEM"),r.getString("TABLE_NAME"),r.getString("REMARKS")});}}
      int total=0;
      for(String[] n:names){String schema=n[0],name=n[1],label=schema+"."+name;List<Object> cols=new ArrayList<>(),indexes=new ArrayList<>(),fks=new ArrayList<>();Set<String> pk=new HashSet<>();
        try(ResultSet r=m.getPrimaryKeys(null,schema,name)){while(r.next())pk.add(r.getString("COLUMN_NAME"));}
        try(ResultSet r=m.getColumns(null,pattern(m,schema),pattern(m,name),"%")){while(r.next()){
          if(++total>10000)throw new SQLException("한 번에 10000개 컬럼까지 읽을 수 있습니다.");
          String cn=r.getString("COLUMN_NAME"),type=r.getString("TYPE_NAME").toUpperCase(Locale.ROOT);int size=r.getInt("COLUMN_SIZE"),scale=r.getInt("DECIMAL_DIGITS");
          if(type.matches("VARCHAR|CHAR|CHARACTER|VARGRAPHIC|GRAPHIC|BINARY|VARBINARY"))type+="("+size+")";
          else if(type.matches("DECIMAL|NUMERIC"))type+="("+size+","+scale+")";
          cols.add(obj("name",cn,"logical",str(r.getString("REMARKS")),"type",type,"pk",pk.contains(cn),"nullable",r.getInt("NULLABLE")!=DatabaseMetaData.columnNoNulls,"ai","YES".equals(r.getString("IS_AUTOINCREMENT")),"identityMode","BY DEFAULT","unique",false,"default",str(r.getString("COLUMN_DEF"))));
        }}
        Map<String,TreeMap<Integer,String>> ixcols=new LinkedHashMap<>();Map<String,Boolean> unique=new HashMap<>();Set<String> unsupported=new HashSet<>();
        try(ResultSet r=m.getIndexInfo(null,schema,name,false,true)){while(r.next()){if(r.getShort("TYPE")==DatabaseMetaData.tableIndexStatistic)continue;String ix=r.getString("INDEX_NAME"),cn=r.getString("COLUMN_NAME");if(ix==null)continue;if(cn==null||"D".equals(r.getString("ASC_OR_DESC")))unsupported.add(ix);else ixcols.computeIfAbsent(ix,k->new TreeMap<>()).put(r.getInt("ORDINAL_POSITION"),cn);unique.put(ix,!r.getBoolean("NON_UNIQUE"));}}
        for(String ix:ixcols.keySet())if(!unsupported.contains(ix))indexes.add(obj("name",ix,"schema",schema,"unique",unique.get(ix),"columns",new ArrayList<>(ixcols.get(ix).values())));
        for(String ix:unsupported)diagnostics.add(obj("level","warning","line",1,"table",label,"message",ix+": 표현식/DESC 인덱스는 제외했습니다."));
        Map<String,Map<String,Object>> keys=new LinkedHashMap<>();Map<String,TreeMap<Integer,String[]>> parts=new LinkedHashMap<>();
        try(ResultSet r=m.getImportedKeys(null,schema,name)){while(r.next()){String id=r.getString("FK_NAME");if(id==null)throw new SQLException("이름 없는 FK 메타데이터는 지원하지 않습니다: "+label);int rule=r.getInt("DELETE_RULE");keys.put(id,obj("parent",obj("schema",str(r.getString("PKTABLE_SCHEM")),"name",r.getString("PKTABLE_NAME")),"onDelete",rule==0?"CASCADE":rule==1?"RESTRICT":rule==2?"SET NULL":"NO ACTION"));parts.computeIfAbsent(id,k->new TreeMap<>()).put(r.getInt("KEY_SEQ"),new String[]{r.getString("FKCOLUMN_NAME"),r.getString("PKCOLUMN_NAME")});}}
        for(String id:keys.keySet()){Map<String,Object> fk=keys.get(id);List<String> from=new ArrayList<>(),to=new ArrayList<>();for(String[] pair:parts.get(id).values()){from.add(pair[0]);to.add(pair[1]);}fk.put("from",from);fk.put("to",to);fks.add(fk);if(from.size()>1)diagnostics.add(obj("level","warning","line",1,"table",label,"message",id+": 복합 FK는 미리보기만 지원합니다."));}
        tables.add(obj("schema",schema,"name",name,"key",json(List.of(schema,name)),"logical",str(n[2]),"valid",true,"line",1,"columns",cols,"indexes",indexes,"foreignKeys",fks));
      }
      System.out.print(json(obj("tables",tables,"diagnostics",diagnostics,"statementCount",0)));
    }
  }catch(Exception e){System.err.print(e instanceof ClassNotFoundException?"IBM JDBC 드라이버를 찾을 수 없습니다. db2jcc4.jar 경로를 확인하세요.":str(e.getMessage()));System.exit(1);}}
}
